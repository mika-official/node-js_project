const express = require('express');
const router = express.Router();
const orderPre = require('../router_handler/orderPre');

// 获取订单预览信息
router.get('/order/pre', orderPre.getOrderPre);

module.exports = router;