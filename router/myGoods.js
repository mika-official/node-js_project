const express = require('express');
const router = express.Router();
const myGoodsHandler = require('../router_handler/myGoods');

router.get('/myGoods', myGoodsHandler.getMyGoods);
router.post('/myGoods/add', myGoodsHandler.addMyGoods);
router.post('/myGoods/delete', myGoodsHandler.deleteMyGoods);

module.exports = router;