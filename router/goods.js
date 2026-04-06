const express = require('express');
const router = express.Router();
const goods = require('../router_handler/goods');

router.get('/good', goods.getGoods);

module.exports = router;
