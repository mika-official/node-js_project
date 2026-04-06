const express = require('express');
const router = express.Router();
const goodGoods = require('../router_handler/goodGoods');

router.get('/goods', goodGoods.getGoodGoods);

module.exports = router;
