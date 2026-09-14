# -*- coding: utf-8 -*-
"""
推荐模型在线服务（FastAPI）
启动：uvicorn app:app --host 127.0.0.1 --port 8000
接口：
  GET  /health                       健康检查 + 模型信息
  GET  /recommend?user_id=&top_k=    给某个用户推荐商品（训练集内的用户）
  POST /recommend/similar            根据一组商品找相似商品（embedding 最近邻）
  GET  /popular?top_k=               热门商品兜底（冷启动）
"""
import json
import os

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")

app = FastAPI(title="rec-service", description="双塔召回模型在线服务")

user_emb = None  # [n_users, d]
item_emb = None  # [n_items, d]
maps = {}
popular = []
meta = {}


def load_artifacts():
    global user_emb, item_emb, maps, popular, meta
    with open(os.path.join(ARTIFACT_DIR, "maps.json"), encoding="utf-8") as f:
        maps = json.load(f)
    with open(os.path.join(ARTIFACT_DIR, "popular.json"), encoding="utf-8") as f:
        popular = json.load(f)["items"]
    with open(os.path.join(ARTIFACT_DIR, "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)
    user_emb = torch.load(os.path.join(ARTIFACT_DIR, "user_emb.pt"), map_location="cpu")
    item_emb = torch.load(os.path.join(ARTIFACT_DIR, "item_emb.pt"), map_location="cpu")
    user_emb = torch.nn.functional.normalize(user_emb, dim=1)
    item_emb = torch.nn.functional.normalize(item_emb, dim=1)


def topk_similar(vec, top_k, exclude_idxs=None):
    exclude = set(exclude_idxs or [])
    scores = item_emb @ vec  # [n_items]
    order = torch.argsort(scores, descending=True).tolist()
    picked = []
    for i in order:
        if len(picked) >= top_k:
            break
        if i not in exclude:
            picked.append({"itemId": maps["idx2item"][str(i)], "score": round(float(scores[i]), 4)})
    return picked


@app.on_event("startup")
def startup():
    load_artifacts()


@app.get("/health")
def health():
    return {"ok": True, "meta": meta}


@app.get("/recommend")
def recommend(user_id: str, top_k: int = 10):
    top_k = max(1, min(top_k, 50))
    idx = maps["user_id2idx"].get(user_id)
    if idx is None:
        return {"user_id": user_id, "cold_start": True, "items": popular[:top_k]}
    with torch.no_grad():
        items = topk_similar(user_emb[int(idx)], top_k)
    return {"user_id": user_id, "cold_start": False, "items": items}


class SimilarReq(BaseModel):
    item_ids: list[str]
    top_k: int = 10


@app.post("/recommend/similar")
def similar(req: SimilarReq):
    top_k = max(1, min(req.top_k, 50))
    idxs = [maps["item_id2idx"].get(i) for i in req.item_ids]
    known = [i for i in idxs if i is not None]
    if not known:
        return {"cold_start": True, "items": popular[:top_k]}
    with torch.no_grad():
        vec = item_emb[torch.tensor(known)].mean(dim=0)
        vec = torch.nn.functional.normalize(vec, dim=0)
        items = topk_similar(vec, top_k, exclude_idxs=known)
    return {"cold_start": False, "items": items}


@app.get("/popular")
def get_popular(top_k: int = 10):
    return {"items": popular[: max(1, min(top_k, 50))]}


if __name__ == "__main__":
    import uvicorn

    load_artifacts()
    uvicorn.run(app, host="127.0.0.1", port=8000)
