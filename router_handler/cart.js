const db = require('../db/index');

// const addCartItem = function (req, res) {
//   // 从中间件拿 userId
//   const userId = req.auth.user_id;

//   const { skuId, count } = req.body;
//   if (!skuId || !count || count <= 0) {
//     return res.json({ code: "-1", msg: "参数错误", result: null });
//   }

//   // 查询商品信息
//   db.query(`
//     SELECT 
//       name,
//       attrs_text AS attrsText,
//       picture,
//       CAST(price AS CHAR) AS price,
//       CAST(now_price AS CHAR) AS nowPrice,
//       CAST(now_original_price AS CHAR) AS nowOriginalPrice,
//       stock,
//       post_fee AS postFee
//     FROM product
//     WHERE skuid = ?
//   `, [skuId], function (err, productResult) {
//     if (err) {
//       return res.json({ code: "-1", msg: "服务器异常", result: null });
//     }
//     if (productResult.length === 0) {
//       return res.json({ code: "-1", msg: "商品不存在", result: null });
//     }

//     const productInfo = productResult[0];
//     if (count > productInfo.stock) {
//       return res.json({ code: "-1", msg: "库存不足", result: null });
//     }

//     // 查询购物车是否已有该 SKU
//     db.query(`
//       SELECT 
//       cart_id AS id,
//       count
//       FROM cart
//       WHERE user_id = ? AND skuid = ?
//     `, [userId, skuId], function (err, cartItemResult) {
//       if (err) {
//         return res.json({ code: "-1", msg: "服务器异常", result: null });
//       }

//       if (cartItemResult.length > 0) {
//         // 已有 → 更新数量
//         const newCount = cartItemResult[0].count + count;
//         const newStock = productInfo.stock - count;
//         db.query(`
//           UPDATE cart SET count = ? WHERE cart_id = ?
//         `, [newCount, cartItemResult[0].id], function (err) {
//           if (err) {
//             return res.json({ code: "-1", msg: "服务器异常", result: null });
//           }
//           db.query(`UPDATE product SET stock = ? WHERE skuid = ?`, [newStock, skuId], function (err) {
//             if (err) {
//               return res.json({ code: "-1", msg: "服务器异常", result: null });
//             }
//           });
//           // 查询后返回
//           db.query(`
//             SELECT
//                 c.product_id AS id,
//                 c.skuid AS skuId,
//                 p.name,
//                 p.desc AS attrsText,
//                 p.picture,
//                 p.price,
//                 p.now_price AS nowPrice,
//                 p.now_original_price AS nowOriginalPrice,
//                 c.selected,
//                 p.stock,
//                 c.count,
//                 c.is_effective AS isEffective,
//                 p.discount,
//                 p.post_fee AS postFee
//             FROM cart c
//             JOIN product p ON c.product_id = p.id
//             WHERE c.cart_id = ?
//         `, [cartItemResult[0].id], function (err, rows) {
//             res.json({
//               code: "1",
//               msg: "操作成功",
//               result: rows[0]
//             });
//           });
//         });
//       } else {
//         // 没有 → 新增
//         const cartData = {
//           user_id: userId,
//           skuid: skuId,
//           product_id: productInfo.id,
//           selected: 1,
//           count: count,
//           is_effective: 1,
//         };
//         db.query(`INSERT INTO cart SET ?`, cartData, function (err, result) {
//           if (err) {
//             return res.json({ code: "-1", msg: "服务器异常", result: null });
//           }
//           const newStock = productInfo.stock - count;
//           db.query(`UPDATE product SET stock = ? WHERE skuid = ?`, [newStock, skuId], function (err) {
//             if (err) {
//               return res.json({ code: "-1", msg: "服务器异常", result: null });
//             } 
//           });
//           db.query(`
//             SELECT
//                 c.product_id AS id,
//                 c.skuid AS skuId,
//                 p.name,
//                 p.desc AS attrsText,
//                 p.picture,
//                 p.price,
//                 p.now_price AS nowPrice,
//                 p.now_original_price AS nowOriginalPrice,
//                 c.selected,
//                 p.stock,
//                 c.count,
//                 c.is_effective AS isEffective,
//                 p.discount,
//                 p.post_fee AS postFee
//             FROM cart c
//             JOIN product p ON c.product_id = p.id
//             WHERE c.id = ?
//           `, [result.insertId], function (err, rows) {
//             res.json({
//               code: "1",
//               msg: "操作成功",
//               result: rows[0]
//             });
//           });
//         });
//       }
//     });
//   });
// }

// const mergeCart = (req, res) => {
//   // 1. 从中间件直接获取已解析的用户ID
//   const userId = req.auth.user_id;

//   // 2. 获取请求体（本地购物车数组）
//   const localCartItems = req.body;

//   // 3. 基础参数校验
//   if (!Array.isArray(localCartItems)) {
//     return res.status(500).json({
//       code: "0",
//       msg: "未携带参数",
//       result: null
//     });
//   }

//   // 校验每个购物车项的必填字段
//   for (const item of localCartItems) {
//     if (
//       !item.skuId ||
//       typeof item.selected !== 'string' ||
//       typeof item.count !== 'number' ||
//       !Number.isInteger(item.count)
//     ) {
//       return res.status(500).json({
//         code: "0",
//         msg: "参数格式错误",
//         result: null
//       });
//     }
//   }

//   // 4. 定义递归遍历函数，逐个处理购物车项
//   let index = 0;
//   const totalItems = localCartItems.length;


//   function processNextItem() {
//     if (index >= totalItems) {
//       // 所有项处理完成，返回成功
//       return res.status(200).json({
//         code: "1",
//         msg: "操作成功",
//         result: null
//       });
//     }

//     const item = localCartItems[index];
//     const { skuId, selected, count } = item;

//     // 先查询该用户是否已有该SKU的购物车记录
//     const checkSql = `
//       SELECT cart_id FROM cart 
//       WHERE user_id = ? AND skuid = ?
//     `;
//     db.query(checkSql, [userId, skuId], (err, rows) => {
//       if (err) {
//         return res.status(500).json({
//           code: "0",
//           msg: "合并购物车失败：" + err.message,
//           result: null
//         });
//       }

//       if (rows.length > 0) {
//         // 存在记录：更新数量和选中状态
//         const updateSql = `
//           UPDATE cart 
//           SET count = ?, selected = ? 
//           WHERE user_id = ? AND skuid = ?
//         `;
//         db.query(updateSql, [count, selected, userId, skuId], (err, updateResult) => {
//           if (err) {
//             return res.status(500).json({
//               code: "0",
//               msg: "更新购物车失败：" + err.message,
//               result: null
//             });
//           }

//           // 处理下一个项
//           index++;
//           processNextItem();
//         });
//       } else {
//         // 不存在记录：插入新记录
//         const insertSql = `
//           INSERT INTO cart (user_id, skuid, selected, count) 
//           VALUES (?, ?, ?, ?)
//         `;
//         db.query(insertSql, [userId, skuId, selected, count], (err, insertResult) => {
//           if (err) {
//             return res.status(500).json({
//               code: "0",
//               msg: "添加购物车失败：" + err.message,
//               result: null
//             });
//           }

//           // 处理下一个项
//           index++;
//           processNextItem();
//         });
//       }
//     });
//   }

//   // 启动递归处理
//   processNextItem();
// }
// 数据库查询的 Promise 包装器


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

const addCartItem = async function (req, res) { 
  try {
    // 从中间件拿 userId 
    const userId = req.auth.user_id; 

    const { skuId, count } = req.body; 
    if (!skuId || !count || count <= 0) { 
      return res.json({ code: "-1", msg: "参数错误", result: null }); 
    } 

    // 查询商品信息 
    const productResult = await queryPromise(` 
      SELECT 
        id,
        name, 
        attrs_text AS attrsText, 
        picture, 
        CAST(price AS CHAR) AS price, 
        CAST(now_price AS CHAR) AS nowPrice, 
        CAST(now_original_price AS CHAR) AS nowOriginalPrice, 
        stock, 
        post_fee AS postFee 
      FROM product 
      WHERE skuid = ? 
    `, [skuId]); 

    if (productResult.length === 0) { 
      return res.json({ code: "-1", msg: "商品不存在", result: null }); 
    } 

    const productInfo = productResult[0]; 
    if (count > productInfo.stock) { 
      return res.json({ code: "-1", msg: "库存不足", result: null }); 
    } 

    // 查询购物车是否已有该 SKU 
    const cartItemResult = await queryPromise(` 
      SELECT 
      cart_id AS id, 
      count 
      FROM cart 
      WHERE user_id = ? AND skuid = ? 
    `, [userId, skuId]); 

    let cartItem;
    if (cartItemResult.length > 0) { 
      // 已有 → 更新数量 
      const newCount = cartItemResult[0].count + count; 
      const newStock = productInfo.stock - count; 
      
      // 更新购物车数量
      await queryPromise(` 
        UPDATE cart SET count = ? WHERE cart_id = ? 
      `, [newCount, cartItemResult[0].id]); 
      
      // 更新商品库存
      await queryPromise(`UPDATE product SET stock = ? WHERE skuid = ?`, [newStock, skuId]); 
      
      // 查询后返回 
      const rows = await queryPromise(` 
        SELECT 
            c.product_id AS id, 
            c.skuid AS skuId, 
            p.name, 
            p.desc AS attrsText, 
            p.picture, 
            p.price, 
            p.now_price AS nowPrice, 
            p.now_original_price AS nowOriginalPrice, 
            c.selected, 
            p.stock, 
            c.count, 
            c.is_effective AS isEffective, 
            p.discount, 
            p.post_fee AS postFee 
        FROM cart c 
        JOIN product p ON c.product_id = p.id 
        WHERE c.cart_id = ? 
      `, [cartItemResult[0].id]); 
      
      cartItem = rows[0];
    } else { 
      // 没有 → 新增 
      const cartData = { 
        user_id: userId, 
        skuid: skuId, 
        product_id: productInfo.id, 
        selected: 1, 
        count: count, 
        is_effective: 1, 
      }; 
      
      const insertResult = await queryPromise(`INSERT INTO cart SET ?`, cartData); 
      
      const newStock = productInfo.stock - count; 
      await queryPromise(`UPDATE product SET stock = ? WHERE skuid = ?`, [newStock, skuId]); 
      
      const rows = await queryPromise(` 
        SELECT 
            c.product_id AS id, 
            c.skuid AS skuId, 
            p.name, 
            p.desc AS attrsText, 
            p.picture, 
            p.price, 
            p.now_price AS nowPrice, 
            p.now_original_price AS nowOriginalPrice, 
            c.selected, 
            p.stock, 
            c.count, 
            c.is_effective AS isEffective, 
            p.discount, 
            p.post_fee AS postFee 
        FROM cart c 
        JOIN product p ON c.product_id = p.id 
        WHERE c.cart_id = ? 
      `, [insertResult.insertId]); 
      
      cartItem = rows[0];
    } 

    res.json({ 
      code: "1", 
      msg: "操作成功", 
      result: cartItem 
    }); 
  } catch (err) {
    console.error('添加购物车失败:', err);
    return res.json({ code: "-1", msg: "服务器异常", result: null }); 
  }
}

const mergeCart = async (req, res) => { 
  try {
    // 1. 从中间件直接获取已解析的用户ID 
    const userId = req.auth.user_id; 

    // 2. 获取请求体（本地购物车数组） 
    const localCartItems = req.body; 

    // 3. 基础参数校验 
    if (!Array.isArray(localCartItems)) { 
      return res.status(500).json({ 
        code: "0", 
        msg: "未携带参数", 
        result: null 
      }); 
    } 

    // 校验每个购物车项的必填字段 
    for (const item of localCartItems) { 
      if ( 
        !item.skuId || 
        typeof item.selected !== 'string' || 
        typeof item.count !== 'number' || 
        !Number.isInteger(item.count) 
      ) { 
        return res.status(500).json({ 
          code: "0", 
          msg: "参数格式错误", 
          result: null 
        }); 
      } 
    } 

    // 4. 逐个处理购物车项 
    for (const item of localCartItems) { 
      const { skuId, selected, count } = item; 

      // 先查询该用户是否已有该SKU的购物车记录 
      const checkSql = ` 
        SELECT cart_id FROM cart 
        WHERE user_id = ? AND skuid = ? 
      `; 
      const rows = await queryPromise(checkSql, [userId, skuId]); 

      if (rows.length > 0) { 
        // 存在记录：更新数量和选中状态 
        const updateSql = ` 
          UPDATE cart 
          SET count = ?, selected = ? 
          WHERE user_id = ? AND skuid = ? 
        `; 
        await queryPromise(updateSql, [count, selected, userId, skuId]); 
      } else { 
        // 不存在记录：插入新记录 
        const insertSql = ` 
          INSERT INTO cart (user_id, skuid, selected, count) 
          VALUES (?, ?, ?, ?) 
        `; 
        await queryPromise(insertSql, [userId, skuId, selected, count]); 
      } 
    } 

    // 所有项处理完成，返回成功 
    return res.status(200).json({ 
      code: "1", 
      msg: "操作成功", 
      result: null 
    }); 
  } catch (err) {
    return res.status(500).json({ 
      code: "0", 
      msg: "合并购物车失败：" + err.message, 
      result: null 
    }); 
  }
}

const getCartItems = (req, res) => {
  const userId = req.auth.user_id;
  console.log(req.auth);
  const sql = `
    SELECT 
      c.cart_id AS cartId,
      c.skuid AS skuId,
      c.selected,
      c.count,
      p.name AS productName,
      p.picture AS imageUrl,
      p.now_price AS nowPrice,
      p.now_original_price AS nowOriginalPrice,
      p.stock,
      p.discount,
      p.post_fee AS postFee
    FROM cart c
    JOIN product p ON c.skuid = p.skuid
    WHERE c.user_id = ?
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({
        code: "0",
        msg: "获取购物车失败：" + err.message,
        result: null
      });
    }

    res.json({
      code: "1",
      msg: "获取购物车成功",
      result: rows
    });
  });
}

module.exports = {
  addCartItem,
  getCartItems,
  mergeCart
}