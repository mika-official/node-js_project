const db = require('../db/index');

const getGoods = function (req, res) {
  const id = req.query.id || 11111111; // 默认返回第1条商品
  const sql = 'SELECT * FROM product WHERE id = ?';
  db.query(sql, [id], (err, results) => {
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
  getGoods
};