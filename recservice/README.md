# rec-service 推荐算法服务（PyTorch 双塔召回）

## 架构

```
Python 训练（离线）                    Python 服务（在线）           Node 后端
train.py ──模型+embedding──▶ artifacts/ ──加载──▶ FastAPI :8000 ◀──fetch──▶ /api/recommend/demo
                                                          ▲
RetailRocket 数据集（hf-mirror 镜像下载）
```

## 快速开始

```bash
# 1. 安装依赖（CPU 版 torch 即可，训练和推理都够用）
pip install -r requirements.txt

# 2. 训练（默认 5 epochs 全量；快速验证可加参数）
python train.py
python train.py --epochs 3 --max-events 200000

# 3. 启动在线服务
uvicorn app:app --host 127.0.0.1 --port 8000

# 4. 验证
curl http://127.0.0.1:8000/health
curl "http://127.0.0.1:8000/recommend?user_id=<数据集里的用户id>&top_k=10"
curl -X POST http://127.0.0.1:8000/recommend/similar -H "Content-Type: application/json" -d "{\"item_ids\":[\"<商品id>\"],\"top_k\":10}"
```

## 数据集说明

- 默认下载 RetailRocket（电商点击/加购/购买，约 94MB），经 hf-mirror 国内镜像
- 下载失败自动生成本地合成数据（保证离线也能跑通流程）
- 自定义数据：`python train.py --data-file events.csv`，列格式 `user_id,item_id,timestamp`

## 模型与评估

- 双塔模型（user/item 各一个 embedding + MLP，点积打分），负采样训练
- leave-one-out 时间切分，采样评估指标：HitRate@10、NDCG@10（见 artifacts/meta.json）

## 冷启动策略

- 训练集内用户 → 用户 embedding 近邻召回
- 新用户 / 新商品 → 训练集热门榜兜底（/popular）
