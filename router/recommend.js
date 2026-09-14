const express = require('express');
const router = express.Router();
const recommendHandler = require('../router_handler/recommend');

// 本地内容推荐（类目关联 + 热门兜底）
router.get('/recommend', recommendHandler.getRecommend);

// PyTorch 双塔模型在线演示（代理 recservice）
router.get('/recommend/demo', recommendHandler.getRecommendDemo);

module.exports = router;
