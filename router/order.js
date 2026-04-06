const express = require('express');
const router = express.Router();
router.use(express.json());
const orderHandler = require('../router_handler/order');

// 创建订单接口
router.post('/order/create', orderHandler.getOrder);

module.exports = router;
