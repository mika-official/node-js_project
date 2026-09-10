const db = require('../db/index');
const cache = require('../utils/cache');

const CACHE_TTL = 5 * 60 * 1000; // 5分钟
const DEFAULT_COUNT = 10; // 默认返回条数
const MAX_COUNT = 50; // 单次返回上限，防止恶意大值拖垮查询和缓存

const getHot = function (req, res) {
  // 参数规范化：只接受 1~50 的整数，非法值回退默认值
  let count = parseInt(req.query.count, 10);
  console.log(count);
  if (!Number.isInteger(count) || count < 1) {
    count = DEFAULT_COUNT;
  } else if (count > MAX_COUNT) {
    count = MAX_COUNT;
  }

  const cacheKey = `hot_${count}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({ code: "0", msg: "获取热门商品成功", result: cached });
  }

  // product 表每个 SKU 一行，按 id 去重后每个商品只出现一次
  const sql = `
    SELECT p.* FROM product p
    JOIN (SELECT id, MIN(skuid) AS skuid FROM product GROUP BY id) t ON t.skuid = p.skuid
    ORDER BY p.hot_score DESC LIMIT ?`;
  db.query(sql, [count], (err, results) => {
    if (err) {
      return res.json({ code: "-1", msg: "服务器异常", result: null });
    }
    if (results.length === 0) {
      return res.json({ code: "-1", msg: "暂无热门商品", result: null });
    }
    cache.set(cacheKey, results, CACHE_TTL);
    res.json({ code: "0", msg: "获取热门商品成功", result: results });
  });
};

module.exports = {
  getHot
};