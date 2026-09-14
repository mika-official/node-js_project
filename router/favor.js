const express = require('express');
const router = express.Router();
router.use(express.json());
const favorHandler = require('../router_handler/favor');

// 点赞/收藏（body: { skuId, action: 'like' | 'collect' }）
router.post('/favor', favorHandler.addFavor);

// 取消点赞/收藏
router.delete('/favor', favorHandler.delFavor);

// 我的点赞/收藏列表（query: action 可选）
router.get('/favor', favorHandler.getFavorList);

module.exports = router;
