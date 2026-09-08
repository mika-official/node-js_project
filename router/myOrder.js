const express = require('express');
const router = express.Router();
const myOrderHandler = require('../router_handler/myOrder');

router.get('/myOrder', myOrderHandler.getMyOrder);

module.exports = router;