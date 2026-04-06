const express = require('express');
const router = express();
const cartHandler = require('../router_handler/cart');

router.use(express.json());

router.get('/member/cart', cartHandler.getCartItems);

// 加入购物车接口
router.post('/member/cart', cartHandler.addCartItem);


/**
 * 合并本地购物车到服务器
 * 登录后调用，合并后清空本地购物车
 */
router.post('/merge', cartHandler.mergeCart);

module.exports = router;
