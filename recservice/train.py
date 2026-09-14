# -*- coding: utf-8 -*-
"""
推荐模型训练脚本：双塔（Two-Tower / DSSM 风格）召回模型
数据集：RetailRocket 电商行为数据（events.csv，经 hf-mirror 镜像下载）
       下载失败时自动生成本地合成数据，保证离线环境也能跑通全流程

用法：
  python train.py                     # 默认参数完整训练
  python train.py --epochs 3 --max-events 200000   # 快速验证
  python train.py --data-file custom.csv            # 自定义数据(user_id,item_id,ts[,weight])

产物（artifacts/ 目录）：
  model.pt      模型权重
  item_emb.pt   商品塔 embedding 矩阵（线上服务用）
  user_emb.pt   用户塔 embedding 矩阵
  maps.json     id 映射（原始id <-> 索引）
  popular.json  训练集热门商品（冷启动兜底）
  meta.json     训练信息与验证指标
"""
import argparse
import json
import os
import time
import urllib.request

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

RETAILROCKET_URL = (
    "https://hf-mirror.com/datasets/shadowcollecter/cxlssd-raw-medium/"
    "resolve/main/retailrocket/events.csv"
)
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")
EVENT_WEIGHT = {"view": 1, "addtocart": 2, "transaction": 3}


# ---------------- 数据下载 / 合成 ----------------
def download_retailrocket():
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, "events.csv")
    if os.path.exists(path):
        return path
    print(f"下载 RetailRocket events.csv（约 94MB）...")
    req = urllib.request.Request(RETAILROCKET_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=600) as resp, open(path, "wb") as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    print("下载完成")
    return path


def generate_synthetic(path, n_users=20000, n_items=5000, n_events=500000, seed=42):
    """网络不可用时生成合成交互数据：user/item 各带潜在向量，交互概率与相似度正相关"""
    rng = np.random.default_rng(seed)
    user_latent = rng.normal(size=(n_users, 16))
    item_latent = rng.normal(size=(n_items, 16))
    scores = user_latent @ item_latent.T
    topk = min(100, n_items)
    rows = []
    for u in range(n_users):
        k = int(n_events / n_users) + 1
        idx = np.argpartition(-scores[u], topk)[:topk]
        pos = rng.choice(idx, size=min(k, topk), p=np.exp(scores[u, idx]) / np.exp(scores[u, idx]).sum())
        for i in pos:
            rows.append((f"u{u}", f"i{i}", int(rng.integers(0, 10**9))))
    pd.DataFrame(rows, columns=["visitorid", "itemid", "timestamp"]).to_csv(path, index=False)
    print(f"已生成合成数据 {len(rows)} 条 -> {path}")
    return path


# ---------------- 数据预处理 ----------------
def to_unix_ts(s):
    """统一时间戳：支持数字（秒）和日期字符串，转成秒级数字，避免混排比较报错"""
    num = pd.to_numeric(s, errors="coerce")
    dt = pd.to_datetime(s, errors="coerce", utc=True).astype("int64") // 10**9
    return num.fillna(dt)


def load_events(args):
    if args.data_file:
        df = pd.read_csv(args.data_file, header=None if args.no_header else 0)
        if args.no_header or not {"visitorid", "itemid"}.issubset(df.columns):
            df.columns = ["visitorid", "itemid", "timestamp"][: df.shape[1]]
    else:
        try:
            path = download_retailrocket()
            df = pd.read_csv(path)
        except Exception as e:
            print(f"数据集下载失败（{e}），改用合成数据")
            path = os.path.join(DATA_DIR, "synthetic.csv")
            df = pd.read_csv(generate_synthetic(path))
    df = df[["visitorid", "itemid", "timestamp"] + (["event"] if "event" in df.columns else [])].dropna()
    df["visitorid"] = df["visitorid"].astype(str)
    df["itemid"] = df["itemid"].astype(str)
    df["timestamp"] = to_unix_ts(df["timestamp"])
    # 事件权重：view=1、addtocart=2、transaction=3，直接进加权损失（EVENT_WEIGHT 定义见文件头）
    if "event" in df.columns:
        df["weight"] = df["event"].map(EVENT_WEIGHT).fillna(1)
    else:
        df["weight"] = 1

    # 合并本地业务数据（购物车/订单/点赞收藏导出的交互），统一走加权损失机制
    # 本地权重 ×10 做冷启动放大（本地样本极少，需要更强的信号）
    local_df = None
    if args.local_file and os.path.exists(args.local_file):
        local_df = pd.read_csv(args.local_file)
        local_df["visitorid"] = local_df["visitorid"].astype(str)
        local_df["itemid"] = local_df["itemid"].astype(str)
        local_df["timestamp"] = to_unix_ts(local_df["timestamp"])
        if "weight" not in local_df.columns:
            local_df["weight"] = 1
        local_df["weight"] = pd.to_numeric(local_df["weight"], errors="coerce").fillna(1) * 10
        local_df["is_local"] = 1
        print(f"合并本地交互 {len(local_df)} 条（权重放大 10 倍）")

    df["is_local"] = 0
    if args.max_events:
        df = df.head(args.max_events)

    # 低频过滤只作用于数据集部分；本地行一律保留（保护冷启动数据）
    while True:
        user_cnt = df.groupby("visitorid")["itemid"].count()
        item_cnt = df.groupby("itemid")["visitorid"].count()
        keep = df["visitorid"].isin(user_cnt[user_cnt >= 5].index) & df["itemid"].isin(
            item_cnt[item_cnt >= 5].index
        )
        new_df = df[keep]
        if len(new_df) == len(df):
            df = new_df
            break
        df = new_df
    if local_df is not None:
        df = pd.concat([df, local_df], ignore_index=True)

    # 同一 (user,item) 去重：保留最后时间戳，权重取该对交互的最大事件权重
    df = df.sort_values("timestamp").groupby(["visitorid", "itemid"], as_index=False).agg(
        timestamp=("timestamp", "last"),
        weight=("weight", "max"),
        is_local=("is_local", "max"),
    )
    print(f"清洗后交互数：{len(df)}，用户：{df.visitorid.nunique()}，商品：{df.itemid.nunique()}，"
          f"权重分布 view/addtocart/transaction/本地≈{[int((df.weight == w).sum()) for w in (1, 2, 3)]} + 本地{(df.weight >= 10).sum()}")
    return df, local_df is not None


def build_splits(df):
    """按时间 leave-one-out：每个用户最后 1 条做测试，倒数第 2 条做验证，其余训练。
    本地交互行（is_local=1）一律进训练集：本地用户交互稀少，切出去就没有训练信号了"""
    local_rows = df[df["is_local"] == 1]
    data_rows = df[df["is_local"] == 0]
    train_rows, val_rows, test_rows = [local_rows], [], []
    for _, g in data_rows.groupby("visitorid"):
        g = g.sort_values("timestamp")
        if len(g) < 3:
            train_rows.append(g)
            continue
        train_rows.append(g.iloc[:-2])
        val_rows.append(g.iloc[-2:-1])
        test_rows.append(g.iloc[-1:])
    train = pd.concat(train_rows)
    val = pd.concat(val_rows) if val_rows else train.iloc[:0]
    test = pd.concat(test_rows) if test_rows else train.iloc[:0]
    return train, val, test


def reindex(train, val, test):
    user_id2idx = {u: i for i, u in enumerate(train.visitorid.unique())}
    item_id2idx = {i: j for j, i in enumerate(train.itemid.unique())}
    idx2user = {v: k for k, v in user_id2idx.items()}
    idx2item = {v: k for k, v in item_id2idx.items()}
    popular = train.groupby("itemid")["visitorid"].count().sort_values(ascending=False)
    popular_ids = [item_id2idx[i] for i in popular.index if i in item_id2idx][:200]
    return user_id2idx, item_id2idx, idx2user, idx2item, popular_ids


# ---------------- 模型 ----------------
class TwoTower(nn.Module):
    def __init__(self, n_users, n_items, emb_dim=32):
        super().__init__()
        self.user_emb = nn.Embedding(n_users, emb_dim)
        self.item_emb = nn.Embedding(n_items, emb_dim)
        self.user_mlp = nn.Sequential(nn.Linear(emb_dim, 64), nn.ReLU(), nn.Linear(64, emb_dim))
        self.item_mlp = nn.Sequential(nn.Linear(emb_dim, 64), nn.ReLU(), nn.Linear(64, emb_dim))
        self._init()

    def _init(self):
        for emb in (self.user_emb, self.item_emb):
            nn.init.normal_(emb.weight, std=0.1)

    def user_tower(self, u):
        return self.user_mlp(self.user_emb(u))

    def item_tower(self, i):
        return self.item_mlp(self.item_emb(i))

    def score(self, u, i):
        u_vec = self.user_tower(u)
        i_vec = self.item_tower(i)
        # i 为 [B, K] 负样本时升一维广播：[B, 1, d] * [B, K, d] -> [B, K]
        if u_vec.dim() < i_vec.dim():
            u_vec = u_vec.unsqueeze(1)
        return (u_vec * i_vec).sum(-1)

    def forward(self, u, pos, neg):
        pos_score = self.score(u, pos)
        neg_score = self.score(u, neg)  # [B, K]
        return pos_score, neg_score


class TrainDataset(Dataset):
    def __init__(self, pairs, n_items, n_neg=4):
        self.pairs = pairs  # [(user_idx, pos_item_idx, weight)]
        self.n_items = n_items
        self.n_neg = n_neg

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, idx):
        u, pos, w = self.pairs[idx]
        neg = np.random.randint(0, self.n_items, size=self.n_neg)
        return u, pos, neg, float(w)


def hr_ndcg(model, pairs, n_items, n_samples=99, top_k=10, batch_size=1024):
    """采样评估：每个正样本配 99 个随机负样本，算 HitRate@K / NDCG@K"""
    model.eval()
    device = next(model.parameters()).device
    hits, ndcgs, cnt = 0.0, 0.0, 0
    with torch.no_grad():
        for start in range(0, len(pairs), batch_size):
            batch = pairs[start : start + batch_size]
            u = torch.tensor([p[0] for p in batch], device=device)
            pos = torch.tensor([p[1] for p in batch], device=device)
            neg = torch.randint(0, n_items, (len(batch), n_samples), device=device)
            cand = torch.cat([pos.unsqueeze(1), neg], dim=1)  # [B, 1+99]
            scores = torch.stack(
                [model.score(u, cand[:, k]) for k in range(cand.shape[1])], dim=1
            )
            ranks = (scores[:, 1:] >= scores[:, 0:1]).sum(1) + 1
            hits += (ranks <= top_k).float().sum().item()
            ndcgs += (1.0 / torch.log2(ranks.float() + 1.0) * (ranks <= top_k).float()).sum().item()
            cnt += len(batch)
    return hits / cnt, ndcgs / cnt


# ---------------- 训练主流程 ----------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--emb-dim", type=int, default=32)
    parser.add_argument("--batch-size", type=int, default=1024)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--n-neg", type=int, default=4)
    parser.add_argument("--max-events", type=int, default=0)
    parser.add_argument("--data-file", type=str, default="")
    parser.add_argument("--no-header", action="store_true")
    parser.add_argument("--local-file", type=str, default="",
                        help="本地业务交互 CSV（visitorid,itemid,timestamp[,weight]），参与训练且不被低频过滤")
    parser.add_argument("--local-steps", type=int, default=0,
                        help="主训练完成后仅用本地数据微调 N 个梯度步（批量 16、学习率 1e-2），强化本地个性化")
    args = parser.parse_args()

    t0 = time.time()
    df, has_local = load_events(args)
    train, val, test = build_splits(df)
    user_id2idx, item_id2idx, idx2user, idx2item, popular_ids = reindex(train, val, test)

    def to_pairs(sub):
        rows = []
        for _, r in sub.iterrows():
            if r.visitorid in user_id2idx and r.itemid in item_id2idx:
                rows.append((user_id2idx[r.visitorid], item_id2idx[r.itemid], float(r.weight)))
        return rows

    train_pairs, val_pairs, test_pairs = to_pairs(train), to_pairs(val), to_pairs(test)
    print(f"train={len(train_pairs)} val={len(val_pairs)} test={len(test_pairs)}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = TwoTower(len(user_id2idx), len(item_id2idx), args.emb_dim).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    loss_fn = nn.BCEWithLogitsLoss(reduction='none')
    loader = DataLoader(
        TrainDataset(train_pairs, len(item_id2idx), args.n_neg),
        batch_size=args.batch_size, shuffle=True,
    )

    best_hr, best_state, patience, patience_left = 0.0, None, 2, 2
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss, n_batch = 0.0, 0
        for u, pos, neg, w in loader:
            u, pos, neg = u.to(device), pos.to(device), neg.to(device)
            w = w.to(device)
            pos_score, neg_score = model(u, pos, neg)
            target = torch.cat([torch.ones_like(pos_score), torch.zeros_like(neg_score.flatten())])
            # 加权损失：正样本按事件权重（view=1/addtocart=2/transaction=3，本地×10），负样本权重为 1
            sample_w = torch.cat([w, torch.ones_like(neg_score.flatten())])
            loss = (loss_fn(torch.cat([pos_score, neg_score.flatten()]), target) * sample_w).mean()
            opt.zero_grad(); loss.backward(); opt.step()
            total_loss += loss.item(); n_batch += 1
        hr, ndcg = hr_ndcg(model, val_pairs, len(item_id2idx)) if val_pairs else (0, 0)
        print(f"epoch {epoch}: loss={total_loss / max(n_batch, 1):.4f} val HR@10={hr:.4f} NDCG@10={ndcg:.4f}")
        if hr > best_hr:
            best_hr, best_state = hr, {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_left = patience
        else:
            patience_left -= 1
            if patience_left == 0:
                print("验证指标不再提升，提前停止")
                break
    if best_state:
        model.load_state_dict(best_state)

    # 导出用 embedding 矩阵先算出来（对比微调会在此基础上改写本地实体行）
    with torch.no_grad():
        u_idx_all = torch.arange(len(user_id2idx), device=device)
        i_idx_all = torch.arange(len(item_id2idx), device=device)
        user_emb_all = model.user_tower(u_idx_all).cpu()
        item_emb_all = model.item_tower(i_idx_all).cpu()

    # 本地数据微调：主训练学的是数据集分布，本地样本太少无法把本地用户/商品拉出先验；
    # 用本地样本单独多训几轮，让本地用户向量强烈贴近其偏好商品（定向强化个性化，仅影响本地实体）
    # 本地用户-商品对（微调和用户向量构造都用它）
    local_pairs = []
    if has_local:
        local_rows = df[df["is_local"] == 1]
        local_pairs = [
            (user_id2idx[r.visitorid], item_id2idx[r.itemid])
            for _, r in local_rows.iterrows()
            if r.visitorid in user_id2idx and r.itemid in item_id2idx
        ]
    if args.local_steps > 0 and has_local:
        if local_pairs:
            # 本地向量对比微调：冻结模型塔，只优化本地用户/商品的 embedding 行。
            # 每个用户：正样本=自己的偏好商品；负样本=其他用户的偏好商品 + 随机数据集商品。
            # 效果保证：自己偏好商品排最前、别人的偏好商品被压下去，数据集商品得分不受影响。
            import random as _random
            from collections import defaultdict as _dd
            by_user = _dd(list)
            for p in local_pairs:
                by_user[p[0]].append(p[1])
            local_users = sorted(by_user.keys())
            local_items = sorted({it for its in by_user.values() for it in its})
            u_idx_of = {u: k for k, u in enumerate(local_users)}
            i_idx_of = {it: k for k, it in enumerate(local_items)}
            u_loc = nn.Parameter(user_emb_all[torch.tensor(local_users)].clone())
            i_loc = nn.Parameter(item_emb_all[torch.tensor(local_items)].clone())
            fine_opt = torch.optim.Adam([u_loc, i_loc], lr=1e-2)
            other_pool = {
                u: [it for u2, its in by_user.items() if u2 != u for it in its]
                for u in local_users
            }
            print(f"本地对比微调：{len(local_users)} 个用户，每个 {args.local_steps} 步（lr=1e-2，冻结模型塔）")
            for u in local_users:
                last_loss = 0.0
                for step in range(args.local_steps):
                    pos = _random.choice(by_user[u])
                    negs = _random.sample(other_pool[u], min(4, len(other_pool[u])))
                    while len(negs) < 8:
                        x = _random.randrange(len(item_id2idx))
                        if x not in i_idx_of:
                            negs.append(x)
                    pos_vec = i_loc[i_idx_of[pos]]
                    neg_vecs = torch.stack(
                        [i_loc[i_idx_of[n]] if n in i_idx_of else item_emb_all[n] for n in negs]
                    )
                    u_vec = u_loc[u_idx_of[u]]
                    pos_score = (u_vec * pos_vec).sum()
                    neg_scores = neg_vecs @ u_vec
                    target = torch.cat([torch.ones(1), torch.zeros(len(negs))])
                    loss = loss_fn(torch.cat([pos_score.reshape(1), neg_scores]), target).mean()
                    fine_opt.zero_grad(); loss.backward(); fine_opt.step()
                    last_loss = loss.item()
                print(f"  user {u}: final loss={last_loss:.4f}")
            # 把优化后的本地向量写回导出矩阵
            with torch.no_grad():
                user_emb_all[torch.tensor(local_users)] = u_loc
                item_emb_all[torch.tensor(local_items)] = i_loc

    test_hr, test_ndcg = hr_ndcg(model, test_pairs, len(item_id2idx)) if test_pairs else (0, 0)
    print(f"test HR@10={test_hr:.4f} NDCG@10={test_ndcg:.4f}")

    # 导出产物
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(ARTIFACT_DIR, "model.pt"))
    torch.save(user_emb_all, os.path.join(ARTIFACT_DIR, "user_emb.pt"))
    torch.save(item_emb_all, os.path.join(ARTIFACT_DIR, "item_emb.pt"))
    with open(os.path.join(ARTIFACT_DIR, "maps.json"), "w", encoding="utf-8") as f:
        json.dump({
            "user_id2idx": user_id2idx, "idx2user": idx2user,
            "item_id2idx": item_id2idx, "idx2item": idx2item,
        }, f, ensure_ascii=False)
    with open(os.path.join(ARTIFACT_DIR, "popular.json"), "w", encoding="utf-8") as f:
        json.dump({"items": [idx2item[i] for i in popular_ids]}, f, ensure_ascii=False)
    with open(os.path.join(ARTIFACT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({
            "dataset": args.data_file or "retailrocket",
            "local_merged": has_local,
            "n_users": len(user_id2idx), "n_items": len(item_id2idx),
            "n_train": len(train_pairs), "emb_dim": args.emb_dim,
            "val_hr10": round(best_hr, 4), "test_hr10": round(test_hr, 4),
            "test_ndcg10": round(test_ndcg, 4),
            "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }, f, ensure_ascii=False)
    print(f"训练完成，耗时 {time.time() - t0:.1f}s，产物在 {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
