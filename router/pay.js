const express = require('express');
const router = express.Router();
const Pay = require('../router_handler/pay');


// 1. 前端调用：创建支付宝支付（跳沙箱）
router.get('/alipay', Pay.goPay);


// 2. 支付宝异步回调（支付成功自动调用）
router.post('/alipay/notify', Pay.payNotify);

module.exports = router;
