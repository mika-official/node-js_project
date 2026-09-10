const express = require('express');
const router = express.Router();
const orderListHandler = require('../router_handler/orderList');

// 买家订单列表
router.get('/order/list', orderListHandler.getOrderList);

// 订单支付信息
router.get('/order/payInfo/:id', orderListHandler.getOrderPayInfo);

module.exports = router;
