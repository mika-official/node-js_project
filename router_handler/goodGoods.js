const db = require('../db/index');

const getGoodGoods = function (req, res) {
    const count = req.query.count || 10; // 默认返回10条热门商品
  const sql = `SELECT * FROM product ORDER BY price ASC LIMIT ${count}`;
  db.query(sql, (err, results) => { 
    if (err) {
      return res.json({ code: "-1", msg: "服务器异常", result: null });
    }
    if (results.length === 0) {
      return res.json({ code: "-1", msg: "暂无热门商品", result: null });
    }
    res.json({ code: "0", msg: "获取热门商品成功", result: results });
  });
};

module.exports = {
  getGoodGoods
};
