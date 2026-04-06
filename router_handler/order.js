const db = require('../db/index');
const Snowflake = require('snowflake-id').default;
const snowflake = new Snowflake({
  mid: 42, // 机器ID，0-1023
  offset: (2020 - 1970) * 365 * 24 * 3600 * 1000 // 时间戳偏移量，单位毫秒
});

// const getOrder = (req, res) => {
//   // 1. 从请求体中解构参数
//   const {
//     deliveryTimeType,
//     payType,
//     payChannel,
//     buyerMessage,
//     goods,
//     addressId
//   } = req.body;
//   const userId = req.auth.user_id;
//   const orderId = snowflake.generate().toString();

//   // 2. 验证地址是否属于当前用户
//   db.query(
//     'SELECT * FROM user_address WHERE id = ? AND user_id = ?',
//     [addressId, userId],
//     (err, addressResult) => {
//       if (err) {
//         return res.status(500).json({ code: 500, message: '查询地址失败' });
//       }
//       if (addressResult.length === 0) {
//         return res.status(400).json({ code: 400, message: '地址不存在或不属于该用户' });
//       }
//       // 3. 验证商品SKU和库存
//       const skuIds = goods.map(item => item.skuId);
//       db.query(
//         'SELECT id, price, stock, skuid FROM product WHERE skuid IN (?)',
//         [skuIds],
//         (err, skuResult) => {
//           if (err) {
//             return res.status(500).json({ code: 500, message: '查询商品SKU失败' });
//           }
//           if (skuResult.length !== goods.length) {
//             return res.status(400).json({ code: 400, message: '部分商品SKU不存在' });
//           }
//           console.log('SKU查询结果:', skuResult);
//           // 检查库存是否充足
//           for (let i = 0; i < goods.length; i++) {
//             const sku = skuResult.find(s => s.skuid === goods[i].skuId);
//             if (sku.stock < goods[i].count) {
//               return res.status(400).json({ code: 400, message: `商品SKU ${sku.skuid} 库存不足` });
//             }
//           }

//           // 4. 计算订单总金额
//           let totalAmount = 0;
//           goods.forEach(item => {
//             const sku = skuResult.find(s => s.skuid === item.skuId);
//             console.log(sku)
//             totalAmount += sku.price * item.count;
//           });

//           // 5. 插入订单主表
//           const orderData = {
//             id: orderId,
//             user_id: userId,
//             address_id: addressId,
//             delivery_time_type: deliveryTimeType,
//             pay_type: payType,
//             pay_channel: payChannel,
//             buyer_message: buyerMessage,
//             total_amount: totalAmount,
//             status: 0, // 0: 待支付
//             create_time: new Date()
//           };
//           db.query(
//             'INSERT INTO `order` SET ?',
//             orderData,
//             (err, orderResult) => {
//               if (err) {
//                 return res.status(500).json({ code: 500, message: '创建订单失败' });
//               }
//               // const orderId = orderResult.insertId;

//               // 6. 插入订单商品表
//               const orderGoodsValues = goods.map(item => {
//                 const sku = skuResult.find(s => s.skuid === item.skuId);
//                 return [orderId, item.skuId, item.count, sku.price];
//               });
//               db.query(
//                 'INSERT INTO order_product (order_id, skuid, count, price) VALUES ?',
//                 [orderGoodsValues],
//                 (err, goodsResult) => {
//                   if (err) {
//                     return res.status(500).json({ code: 500, message: '创建订单商品失败' });
//                   }

//                   // 7. 更新商品库存
//                   const updateStockQueries = goods.map(item => {
//                     return `UPDATE product SET stock = stock - ${item.count} WHERE skuid = ${item.skuId}`;
//                   }).join(';');
//                   db.query(updateStockQueries, (err, stockResult) => {
//                     if (err) {
//                       return res.status(500).json({ code: 500, message: '更新库存失败' });
//                     }

//                     // 8. 返回订单ID给前端
//                     res.json({
//                       code: 200,
//                       result: {
//                         id: orderId
//                       }
//                     });
//                   });
//                 }
//               );
//             }
//           );
//         }
//       );
//     }
//   );
// };

// 数据库查询的 Promise 包装器
function queryPromise(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

const getOrder = async (req, res) => { 
  try {
    // 1. 从请求体中解构参数 
    const { 
      deliveryTimeType, 
      payType, 
      payChannel, 
      buyerMessage, 
      goods, 
      addressId 
    } = req.body; 
    const userId = req.auth.user_id; 
    const orderId = snowflake.generate().toString(); 

    // 2. 验证地址是否属于当前用户 
    const addressResult = await queryPromise( 
      'SELECT * FROM user_address WHERE id = ? AND user_id = ?', 
      [addressId, userId]
    ); 
    
    if (addressResult.length === 0) { 
      return res.status(400).json({ code: 400, message: '地址不存在或不属于该用户' }); 
    } 
    
    // 3. 验证商品SKU和库存 
    const skuIds = goods.map(item => item.skuId); 
    const skuResult = await queryPromise( 
      'SELECT id, price, stock, skuid FROM product WHERE skuid IN (?)', 
      [skuIds]
    ); 
    
    if (skuResult.length !== goods.length) { 
      return res.status(400).json({ code: 400, message: '部分商品SKU不存在' }); 
    } 
    
    console.log('SKU查询结果:', skuResult); 
    
    // 检查库存是否充足 
    for (let i = 0; i < goods.length; i++) { 
      const sku = skuResult.find(s => s.skuid === goods[i].skuId); 
      if (sku.stock < goods[i].count) { 
        return res.status(400).json({ code: 400, message: `商品SKU ${sku.skuid} 库存不足` }); 
      } 
    } 

    // 4. 计算订单总金额 
    let totalAmount = 0; 
    goods.forEach(item => { 
      const sku = skuResult.find(s => s.skuid === item.skuId); 
      console.log(sku);
      totalAmount += sku.price * item.count; 
    }); 

    // 5. 插入订单主表 
    const orderData = { 
      id: orderId, 
      user_id: userId, 
      address_id: addressId, 
      delivery_time_type: deliveryTimeType, 
      pay_type: payType, 
      pay_channel: payChannel, 
      buyer_message: buyerMessage, 
      total_amount: totalAmount, 
      status: 0, // 0: 待支付 
      create_time: new Date() 
    }; 
    
    await queryPromise( 
      'INSERT INTO `order` SET ?', 
      orderData
    ); 

    // 6. 插入订单商品表 
    const orderGoodsValues = goods.map(item => { 
      const sku = skuResult.find(s => s.skuid === item.skuId); 
      return [orderId, item.skuId, item.count, sku.price]; 
    }); 
    
    await queryPromise( 
      'INSERT INTO order_product (order_id, skuid, count, price) VALUES ?', 
      [orderGoodsValues]
    ); 

    // 7. 更新商品库存 
    for (const item of goods) { 
      await queryPromise( 
        'UPDATE product SET stock = stock - ? WHERE skuid = ?', 
        [item.count, item.skuId]
      ); 
    } 

    // 8. 返回订单ID给前端 
    res.json({ 
      code: 200, 
      result: { 
        id: orderId 
      } 
    }); 
  } catch (err) {
    console.error('创建订单失败:', err);
    return res.status(500).json({ code: 500, message: '服务器异常' }); 
  }
};

module.exports = {
  getOrder
};
