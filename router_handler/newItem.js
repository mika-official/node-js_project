const db = require('../db/index');

// 获取最新商品列表


// 获取所有一级分类 + 二级分类 + 一级分类下的所有商品
// const getAllCategory = function (req, res) {
//   // 1. 查询所有一级分类 parent_id IS NULL
//   console.log('查询所有一级分类 parent_id IS NULL');
//   db.query(
//     'SELECT id, name, picture FROM category WHERE parent_id IS NULL',
//     function (err, level1List) {
//       if (err) {
//         return res.json({ code: "-1", msg: "服务器异常", result: null });
//       }
//       console.log(level1List);
//       const total1 = level1List.length;
//       let done1 = 0;
//       const result = [];
//       //如果一级分类为空，直接返回空数组
//       if (total1 === 0) {
//         return res.json({ code: "1", msg: "操作成功", result: result });
//       }
//       // 遍历每个一级分类
//       level1List.forEach(function (level1) {
//         const level1Id = level1.id;
//         console.log(level1Id);
//         // 查询当前一级分类下的 二级分类
//         db.query(
//           'SELECT id, name, picture FROM category WHERE parent_id = ?',
//           [level1Id],
//           function (err, level2List) {
//             // 组装二级分类
//             const children = level2List.map(function (item) {
//               return {
//                 id: item.id,
//                 name: item.name,
//                 picture: item.picture,
//                 children: null,
//                 goods: null
//               };
//             });

//             //查询当前一级分类下的 所有商品（多对多）
//             db.query(
//               `SELECT 
//                 p.id, 
//                 p.name, 
//                 p.desc, 
//                 CAST(p.price AS CHAR) AS price, 
//                 p.picture, 
//                 p.discount, 
//                 p.order_num AS orderNum 
//               FROM product p
//               JOIN category_product cp ON p.id = cp.product_id
//               WHERE cp.category_id = ?`,
//               [level1Id],
//               function (err, goods) {
//                 done1++;
//                 // 一级分类最终结构
//                 result.push({
//                   id: level1.id,
//                   name: level1.name,
//                   picture: level1.picture,
//                   children: children,
//                   goods: goods || []
//                 });

//                 // 全部处理完返回
//                 if (done1 === total1) {
//                   res.json({
//                     code: "1",
//                     msg: "操作成功",
//                     result: result
//                   });
//                 }
//               }
//             );
//           }
//         );
//       });
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

const getAllCategory = async function (req, res) { 
  try {
    // 1. 查询所有一级分类 parent_id IS NULL 
    console.log('查询所有一级分类 parent_id IS NULL'); 
    const level1List = await queryPromise( 
      'SELECT id, name, picture FROM category WHERE parent_id IS NULL'
    ); 
    
    console.log(level1List); 
    const result = []; 
    
    //如果一级分类为空，直接返回空数组 
    if (level1List.length === 0) { 
      return res.json({ code: "1", msg: "操作成功", result: result }); 
    } 
    
    // 遍历每个一级分类 
    for (const level1 of level1List) { 
      const level1Id = level1.id; 
      console.log(level1Id); 
      
      // 查询当前一级分类下的 二级分类 
      const level2List = await queryPromise( 
        'SELECT id, name, picture FROM category WHERE parent_id = ?', 
        [level1Id]
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

      //查询当前一级分类下的 所有商品（多对多） 
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
        [level1Id]
      ); 
      
      // 一级分类最终结构 
      result.push({ 
        id: level1.id, 
        name: level1.name, 
        picture: level1.picture, 
        children: children, 
        goods: goods || [] 
      }); 
    } 
    
    // 全部处理完返回 
    res.json({ 
      code: "1", 
      msg: "操作成功", 
      result: result 
    }); 
  } catch (err) {
    console.error('获取分类失败:', err);
    return res.json({ code: "-1", msg: "服务器异常", result: null }); 
  }
};


module.exports = {
  getAllCategory
}

