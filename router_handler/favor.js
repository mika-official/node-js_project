const db = require('../db/index');

const ACTIONS = ['like', 'collect'];

function queryPromise(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// 点赞 / 收藏商品（重复操作幂等，不会产生重复记录）
const addFavor = async (req, res) => {
  try {
    const userId = req.auth && req.auth.user_id;
    if (!userId) {
      return res.status(401).json({ code: '0', msg: '未登录', result: null });
    }
    const { skuId, action } = req.body;
    if (!skuId || !ACTIONS.includes(action)) {
      return res.status(400).json({ code: '0', msg: '参数错误：action 必须为 like 或 collect', result: null });
    }
    const sku = await queryPromise('SELECT skuid FROM product WHERE skuid = ?', [skuId]);
    if (sku.length === 0) {
      return res.status(400).json({ code: '0', msg: '商品不存在', result: null });
    }
    await queryPromise(
      'INSERT IGNORE INTO user_favor (user_id, skuid, action) VALUES (?, ?, ?)',
      [userId, skuId, action]
    );
    res.json({ code: '1', msg: action === 'like' ? '点赞成功' : '收藏成功', result: null });
  } catch (err) {
    console.error('点赞/收藏失败:', err);
    res.status(500).json({ code: '0', msg: '服务器异常', result: null });
  }
};

// 取消点赞 / 收藏
const delFavor = async (req, res) => {
  try {
    const userId = req.auth && req.auth.user_id;
    if (!userId) {
      return res.status(401).json({ code: '0', msg: '未登录', result: null });
    }
    const { skuId, action } = req.body;
    if (!skuId || !ACTIONS.includes(action)) {
      return res.status(400).json({ code: '0', msg: '参数错误：action 必须为 like 或 collect', result: null });
    }
    await queryPromise(
      'DELETE FROM user_favor WHERE user_id = ? AND skuid = ? AND action = ?',
      [userId, skuId, action]
    );
    res.json({ code: '1', msg: '已取消', result: null });
  } catch (err) {
    console.error('取消点赞/收藏失败:', err);
    res.status(500).json({ code: '0', msg: '服务器异常', result: null });
  }
};

// 我的点赞/收藏列表（带商品信息）
const getFavorList = async (req, res) => {
  try {
    const userId = req.auth && req.auth.user_id;
    if (!userId) {
      return res.status(401).json({ code: '0', msg: '未登录', result: null });
    }
    const { action } = req.query;
    const where = 'WHERE f.user_id = ?' + (ACTIONS.includes(action) ? ' AND f.action = ?' : '');
    const params = ACTIONS.includes(action) ? [userId, action] : [userId];
    const rows = await queryPromise(
      `SELECT f.skuid AS skuId, f.action, f.create_time AS createTime,
              p.id AS productId, p.name, p.picture, p.price
       FROM user_favor f
       JOIN product p ON p.skuid = f.skuid
       ${where}
       ORDER BY f.create_time DESC`,
      params
    );
    res.json({ code: '1', msg: '查询成功', result: rows });
  } catch (err) {
    console.error('查询点赞/收藏失败:', err);
    res.status(500).json({ code: '0', msg: '服务器异常', result: null });
  }
};

module.exports = {
  addFavor,
  delFavor,
  getFavorList
};
