const db = require('../db/index');
const Snowflake = require('snowflake-id').default;
const { withTransaction } = require('../utils/db');
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
    // 用户ID由JWT中间件从token解析而来，不需要前端额外传参
    const userId = req.auth && req.auth.user_id;
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
    }
    const orderId = snowflake.generate().toString();

    // 2. 校验 goods 参数：非空数组，且每个商品的 skuId、count 必须合法（count 为正整数）
    if (!Array.isArray(goods) || goods.length === 0) {
      return res.status(400).json({ code: 400, message: '商品列表不能为空' });
    }
    for (const item of goods) {
      if (!item.skuId || !Number.isInteger(item.count) || item.count <= 0) {
        return res.status(400).json({ code: 400, message: '商品参数不合法' });
      }
    }

    // 3. 验证地址是否属于当前用户
    const addressResult = await queryPromise(
      'SELECT * FROM user_address WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );

    if (addressResult.length === 0) {
      return res.status(400).json({ code: 400, message: '地址不存在或不属于该用户' });
    }

    // 4. 验证商品SKU和库存（快速失败，最终防超卖由事务内的条件扣减保证）
    const skuIds = goods.map(item => item.skuId);
    const skuResult = await queryPromise(
      'SELECT id, price, stock, skuid, seller_id FROM product WHERE skuid IN (?)',
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

    // 5. 计算订单总金额
    let totalAmount = 0;
    goods.forEach(item => {
      const sku = skuResult.find(s => s.skuid === item.skuId);
      console.log(sku);
      totalAmount += sku.price * item.count;
    });

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

    // 6. 事务：插入订单 → 插入订单商品 → 逐条扣库存
    //    任何一步失败都会整体回滚，不会留下"订单建了库存没扣"的脏数据
    await withTransaction(async tx => {
      // 6.1 插入订单主表
      await tx.query(
        'INSERT INTO `order` SET ?',
        orderData
      );

      // 6.2 插入订单商品表
      const orderGoodsValues = goods.map(item => {
        const sku = skuResult.find(s => s.skuid === item.skuId);
        return [orderId, item.skuId, item.count, sku.price];
      });
      await tx.query(
        'INSERT INTO order_product (order_id, skuid, count, price) VALUES ?',
        [orderGoodsValues]
      );

      // 6.2.1 插入订单-卖家关系表：一个订单可能包含多个卖家的商品，
      //        按卖家去重，无卖家的商品（seller_id 为空）跳过
      const sellerIds = [...new Set(
        goods
          .map(item => skuResult.find(s => s.skuid === item.skuId)?.seller_id)
          .filter(Boolean)
      )];
      if (sellerIds.length > 0) {
        await tx.query(
          'INSERT INTO order_seller (order_id, seller_id) VALUES ?',
          [sellerIds.map(sellerId => [orderId, sellerId])]
        );
      }

      // 6.3 原子扣库存：stock >= ? 防止超卖
      //     并发下条件不满足时 affectedRows 为 0，抛错回滚整个订单
      for (const item of goods) {
        const upd = await tx.query(
          'UPDATE product SET stock = stock - ? WHERE skuid = ? AND stock >= ?',
          [item.count, item.skuId, item.count]
        );
        if (upd.affectedRows === 0) {
          const err = new Error(`商品SKU ${item.skuId} 库存不足`);
          err.isBizError = true;
          throw err;
        }
      }
    });

    // 7. 返回订单ID给前端
    res.json({
      code: 200,
      result: {
        id: orderId
      }
    });
  } catch (err) {
    // 业务错误（库存不足）：事务已回滚，返回对应提示
    if (err.isBizError) {
      return res.status(400).json({ code: 400, message: err.message });
    }
    console.error('创建订单失败:', err);
    return res.status(500).json({ code: 500, message: '服务器异常' });
  }
};

module.exports = {
  getOrder
};
