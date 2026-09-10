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

// 3 次查询取全部数据，用 Map 在内存中组装分类树，分类越多性能优势越明显
const getAllCategory = async function (req, res) {
  try {
    // 两次查询互相独立，用 Promise.all 并行执行
    const [allCategories, goodsWithCategory] = await Promise.all([
      // 1. 查询所有分类
      queryPromise('SELECT id, name, picture, parent_id FROM category'),
      // 2. 查询所有商品及其分类关联
      queryPromise(
        `SELECT
          p.id,
          p.name,
          p.desc,
          CAST(p.price AS CHAR) AS price,
          p.picture,
          p.discount,
          p.order_num AS orderNum,
          cp.category_id
        FROM category_product cp
        JOIN (SELECT id, MIN(skuid) AS skuid FROM product GROUP BY id) t ON t.id = cp.product_id
        JOIN product p ON p.skuid = t.skuid`
      )
    ]);

    // 3. 用 Map 存储所有分类节点
    const categoryMap = new Map();
    const rootCategories = []; // 存储一级分类

    allCategories.forEach(item => {
      const node = {
        id: item.id,
        name: item.name,
        picture: item.picture,
        children: [],
        goods: []
      };
      categoryMap.set(item.id, node);

      // 如果是一级分类（parent_id IS NULL），加入根数组
      if (item.parent_id === null) {
        rootCategories.push(node);
      }
    });

    // 4. 将子分类挂载到父分类的 children 中
    allCategories.forEach(item => {
      if (item.parent_id !== null && categoryMap.has(item.parent_id)) {
        const parentNode = categoryMap.get(item.parent_id);
        parentNode.children.push(categoryMap.get(item.id));
      }
    });

    // 5. 将商品挂载到对应的分类下
    goodsWithCategory.forEach(goods => {
      const categoryId = goods.category_id;
      if (categoryMap.has(categoryId)) {
        // 删除 category_id 字段，避免暴露不必要的数据
        const { category_id, ...goodsData } = goods;
        categoryMap.get(categoryId).goods.push(goodsData);
      }
    });

    return res.json({ code: "1", msg: "操作成功", result: rootCategories });

  } catch (error) {
    console.error('获取分类数据失败:', error);
    return res.json({ code: "-1", msg: "服务器异常", result: null });
  }
};


module.exports = {
  getAllCategory
}
