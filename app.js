const express = require('express');

//创建服务器实例
const app = express();
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

//导入并配置cors中间件
const cors = require('cors');
app.use(cors());
app.use(express.urlencoded({ extended: false }));

// 导入并配置JWT中间件
const { expressjwt } = require('express-jwt');
const config = require('./config');
app.use(expressjwt({ secret: config.jwtSecret, algorithms: ['HS256'], credentialsRequired: false }).unless({ path: [/^\/api/] }));  

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


// 配置JWT错误处理中间件
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ message: '未授权，登录过期或无效' });
  }
  next();
});