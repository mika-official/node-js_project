const express = require('express');

//创建服务器实例
const app = express();
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

//导入并配置cors中间件
const cors = require('cors');
app.use(cors());
// JSON 和表单两种请求体都支持（前端 axios 默认发 JSON）
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 导入并配置JWT中间件
const { expressjwt } = require('express-jwt');
const config = require('./config');
// /pay/alipay 是支付页 <a> 链接跳转，浏览器带不了 Authorization 头，需免鉴权（goPay 内部会做订单校验）
app.use(expressjwt({ secret: config.jwtSecret, algorithms: ['HS256'], credentialsRequired: false }).unless({ path: [/^\/api/, /^\/pay\/alipay/] }));

//导入热门商品路由模块并使用
const hotRouter = require('./router/hot');
app.use('/api', hotRouter);

//导入好物推荐路由模块并使用
const goodGoodsRouter = require('./router/goodGoods');
app.use('/api', goodGoodsRouter);

//导入分类路由模块并使用
const categoryRouter = require('./router/subCategory');
app.use('/api', categoryRouter);

//导入商品查询模块并使用
const goodsRouter = require('./router/goods');
app.use('/api', goodsRouter);

//导入用户路由模块并使用
const userRouter = require('./router/user');
app.use('/api', userRouter);

//导入商品路由模块并使用
const newItemRouter = require('./router/newItem');
app.use('/api', newItemRouter);

//导入购物车路由模块并使用
const cartRouter = require('./router/cart');
app.use(cartRouter);

//导入订单创建模块并使用
const orderPreRouter = require('./router/orderPre');
app.use(orderPreRouter);

//导入订单路由模块并使用
const orderRouter = require('./router/order');
app.use(orderRouter);

//导入支付路由模块并使用
const payRouter = require('./router/pay');
app.use('/pay', payRouter);

const myGoodsRouter = require('./router/myGoods');
app.use(myGoodsRouter);

//导入我的订单路由模块并使用
const myOrderRouter = require('./router/myOrder');
app.use(myOrderRouter);

//导入买家订单列表与支付信息路由模块并使用
const orderListRouter = require('./router/orderList');
app.use(orderListRouter);

//导入推荐路由模块并使用
// 注意：不能挂在 /api 下——JWT 中间件豁免所有 /api 路径，req.auth 永远是 undefined，
// 登录态推荐分支就不会生效。挂根路径后未登录请求不报 401（credentialsRequired:false），走热门兜底
const recommendRouter = require('./router/recommend');
app.use(recommendRouter);

//导入点赞收藏路由模块并使用（需要登录）
const favorRouter = require('./router/favor');
app.use(favorRouter);


// 配置JWT错误处理中间件
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ message: '未授权，登录过期或无效' });
  }
  next();
});