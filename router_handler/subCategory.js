const db = require('../db/index');

// const getSubCategory = function (req, res) {
//   // 拿到前端传的一级分类ID
//   const categoryId = req.query.categoryId;

//   if (!categoryId) {
//     return res.json({ code: "-1", msg: "请传入分类ID", result: null });
//   }

//   // 查询当前ID对应的一级分类
//   db.query(
//     'SELECT id, name, picture FROM category WHERE id = ? AND parent_id IS NULL',
//     [categoryId],
//     function (err, level1List) {
//       if (err) {
//         return res.json({ code: "-1", msg: "服务器异常", result: null });
//       }

//       // 没有这个一级分类
//       if (level1List.length === 0) {
//         return res.json({ code: "-1", msg: "该分类不存在", result: null });
//       }

//       // 取出当前的一级分类
//       const level1 = level1List[0];

//       // 查询当前一级分类下的二级分类
//       db.query(
//         'SELECT id, name, picture FROM category WHERE parent_id = ?',
//         [level1.id],
//         function (err, level2List) {
//           if (err) {
//             return res.json({ code: "-1", msg: "服务器异常", result: null });
//           }
//           // 组装二级分类
//           const children = level2List.map(function (item) {
//             return {
//               id: item.id,
//               name: item.name,
//               picture: item.picture,
//               children: null,
//               goods: null
//             };
//           });

//           // 查询当前一级分类下的所有商品
//           db.query(
//             `SELECT 
//               p.id, 
//               p.name, 
//               p.desc, 
//               CAST(p.price AS CHAR) AS price, 
//               p.picture, 
//               p.discount, 
//               p.order_num AS orderNum 
//             FROM product p
//             JOIN category_product cp ON p.id = cp.product_id
//             WHERE cp.category_id = ?`,
//             [level1.id],
//             function (err, goods) {
//               // 组装一级分类最终结构
//               const result = {
//                 id: level1.id,
//                 name: level1.name,
//                 picture: level1.picture,
//                 children: children,
//                 goods: goods || []
//               };

//               // 返回一级分类详情数据
//               res.json({
//                 code: "1",
//                 msg: "操作成功",
//                 result: result
//               });
//             }
//           );
//         }
//       );
//     }
//   );
// }

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

const getSubCategory = async function (req, res) { 
  try {
    // 拿到前端传的一级分类ID 
    const categoryId = req.query.categoryId; 

    if (!categoryId) { 
      return res.json({ code: "-1", msg: "请传入分类ID", result: null }); 
    } 

    // 查询当前ID对应的一级分类 
    const level1List = await queryPromise( 
      'SELECT id, name, picture FROM category WHERE id = ? AND parent_id IS NULL', 
      [categoryId]
    ); 

    // 没有这个一级分类 
    if (level1List.length === 0) { 
      return res.json({ code: "-1", msg: "该分类不存在", result: null }); 
    } 

    // 取出当前的一级分类 
    const level1 = level1List[0]; 

    // 查询当前一级分类下的二级分类 
    const level2List = await queryPromise( 
      'SELECT id, name, picture FROM category WHERE parent_id = ?', 
      [level1.id]
    ); 

    // 组装二级分类 
    const children = level2List.map(function (item) { 
      return { 
        id: item.id, 
        name: item.name, 
        picture: item.picture, 
        children: null, 
        goods: null 
      }; 
    }); 

    // 查询当前一级分类下的所有商品 
    const goods = await queryPromise( 
      `SELECT 
        p.id, 
        p.name, 
        p.desc, 
        CAST(p.price AS CHAR) AS price, 
        p.picture, 
        p.discount, 
        p.order_num AS orderNum 
      FROM product p 
      JOIN category_product cp ON p.id = cp.product_id 
      WHERE cp.category_id = ?`, 
      [level1.id]
    ); 

    // 组装一级分类最终结构 
    const result = { 
      id: level1.id, 
      name: level1.name, 
      picture: level1.picture, 
      children: children, 
      goods: goods || [] 
    }; 

    // 返回一级分类详情数据 
    res.json({ 
      code: "1", 
      msg: "操作成功", 
      result: result 
    }); 
  } catch (err) {
    console.error('获取分类详情失败:', err);
    return res.json({ code: "-1", msg: "服务器异常", result: null }); 
  }
}

module.exports = {
  getCategoryInfo: getSubCategory
}