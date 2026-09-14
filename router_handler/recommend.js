const db = require('../db/index');

// 推荐服务地址（Python FastAPI），可用环境变量覆盖
const REC_SERVICE_URL = process.env.REC_SERVICE_URL || 'http://127.0.0.1:8000';

function queryPromise(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// 全局热门兜底（按热度去重后的 SPU 列表）
async function getHotProducts(topK) {
  return queryPromise(
    `SELECT p.id, p.name, p.picture, p.price, p.hot_score AS hotScore
     FROM product p
     JOIN (SELECT id, MIN(skuid) AS skuid FROM product GROUP BY id) t ON t.skuid = p.skuid
     ORDER BY p.hot_score DESC, p.order_num DESC
     LIMIT ?`,
    [topK]
  );
}

/**
 * GET /api/recommend
 * 本地内容推荐：根据用户最近下单商品的类目，推荐同类目其他商品；不足用全局热门补齐。
 * 未登录/无订单时直接返回全局热门。
 */
const getRecommend = async (req, res) => {
  try {
    const topK = Math.max(1, Math.min(parseInt(req.query.topK, 10) || 10, 50));
    const userId = req.auth && req.auth.user_id;
    const items = [];
    const seenIds = new Set();

    if (userId) {
      // 1a. 用户点赞/收藏的商品（最强兴趣信号，排前面）
      // 注意：DISTINCT 时 ORDER BY 的列必须在 SELECT 列表里（MySQL 8 限制），所以去掉 DISTINCT
      const favorSpus = await queryPromise(
        `SELECT f.skuid, p.id AS spuId
         FROM user_favor f
         JOIN product p ON p.skuid = f.skuid
         WHERE f.user_id = ?
         ORDER BY f.create_time DESC
         LIMIT 10`,
        [userId]
      );
      // 1b. 用户最近下单的商品（同上面，DISTINCT 时 ORDER BY 列必须在 SELECT 列表里）
      const recentSpus = await queryPromise(
        `SELECT op.skuid, p.id AS spuId
         FROM \`order\` o
         JOIN order_product op ON op.order_id = o.id
         JOIN product p ON p.skuid = op.skuid
         WHERE o.user_id = ?
         ORDER BY o.create_time DESC
         LIMIT 10`,
        [userId]
      );
      const spuIds = [];
      const seenSpu = new Set();
      favorSpus.concat(recentSpus).forEach((r) => {
        if (!seenSpu.has(r.spuId)) {
          seenSpu.add(r.spuId);
          spuIds.push(r.spuId);
        }
      });

      if (spuIds.length > 0) {
        // 2. 这些商品所在类目
        const catRows = await queryPromise(
          'SELECT DISTINCT category_id FROM category_product WHERE product_id IN (?)',
          [spuIds]
        );
        const categoryIds = catRows.map((r) => r.category_id);

        if (categoryIds.length > 0) {
          // 3. 同类目其他商品（排除已买过的），按热度排序，按 SPU 去重
          const recs = await queryPromise(
            `SELECT p.id, p.name, p.picture, p.price, p.hot_score AS hotScore
             FROM category_product cp
             JOIN (SELECT id, MIN(skuid) AS skuid FROM product GROUP BY id) t ON t.id = cp.product_id
             JOIN product p ON p.skuid = t.skuid
             WHERE cp.category_id IN (?) AND cp.product_id NOT IN (?)
             ORDER BY p.hot_score DESC, p.order_num DESC
             LIMIT ?`,
            [categoryIds, spuIds, topK]
          );
          recs.forEach((r) => {
            if (!seenIds.has(r.id)) {
              seenIds.add(r.id);
              items.push({ ...r, reason: '同类目推荐' });
            }
          });
        }
      }
    }

    // 4. 不足 topK 用全局热门补齐
    if (items.length < topK) {
      const hot = await getHotProducts(topK);
      for (const h of hot) {
        if (items.length >= topK) break;
        if (!seenIds.has(h.id)) {
          seenIds.add(h.id);
          items.push({ ...h, reason: '热门推荐' });
        }
      }
    }

    res.json({ code: '1', msg: '获取推荐成功', result: { source: 'local', items } });
  } catch (err) {
    console.error('获取推荐失败:', err);
    res.status(500).json({ code: '0', msg: '服务器异常', result: null });
  }
};

/**
 * GET /api/recommend/demo
 * 代理到 Python 推荐服务，演示 PyTorch 双塔模型对【本地用户】的在线推理。
 * 参数：userId（本地用户 id，如 "1"，服务内部转成 local_1 调用模型）、topK、
 *      localOnly=1（只返回能映射到本地商品表的推荐结果）
 * 本地商品在训练集里以 local_ 前缀存在，返回时映射回 product 表信息。
 */
const getRecommendDemo = async (req, res) => {
  try {
    const userId = req.query.userId || '';
    const topK = Math.max(1, Math.min(parseInt(req.query.topK, 10) || 10, 50));
    const localOnly = req.query.localOnly === '1';
    if (!userId) {
      return res.status(400).json({ code: '0', msg: '缺少 userId 参数（本地用户 id）', result: null });
    }
    const pyUserId = userId.startsWith('local_') ? userId : `local_${userId}`;
    const resp = await fetch(
      `${REC_SERVICE_URL}/recommend?user_id=${encodeURIComponent(pyUserId)}&top_k=${topK}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) {
      return res.status(502).json({ code: '0', msg: `推荐服务返回 ${resp.status}`, result: null });
    }
    const data = await resp.json();

    // 归一化：热门兜底返回字符串数组，模型推理返回 [{itemId, score}]
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = rawItems.map((it) =>
      typeof it === 'string' ? { itemId: it, score: null } : it
    );

    // 把 local_ 前缀的商品映射回本地 product 表（附名字/图片/价格）
    const localSkus = items
      .filter((it) => it.itemId.startsWith('local_'))
      .map((it) => it.itemId.slice('local_'.length));
    const productMap = {};
    if (localSkus.length > 0) {
      // skuid 是 product 表主键，直接查即可（不需要 SPU 去重）
      const rows = await queryPromise(
        `SELECT p.skuid, p.id, p.name, p.picture, p.price, p.hot_score AS hotScore
         FROM product p
         WHERE p.skuid IN (?)`,
        [localSkus]
      );
      rows.forEach((r) => (productMap[r.skuid] = r));
    }
    const mapped = items.map((it) => {
      const sku = it.itemId.startsWith('local_') ? it.itemId.slice('local_'.length) : '';
      const info = productMap[sku];
      return info
        ? { itemId: info.skuid, productId: info.id, name: info.name, picture: info.picture, price: info.price, score: it.score, isLocal: true }
        : { itemId: it.itemId, score: it.score, isLocal: false };
    });

    const resultItems = localOnly ? mapped.filter((it) => it.isLocal) : mapped;
    res.json({
      code: '1',
      msg: '获取推荐成功',
      result: { source: 'pytorch', user_id: data.user_id, cold_start: data.cold_start, items: resultItems }
    });
  } catch (err) {
    console.error('调用推荐服务失败:', err.message);
    res.status(503).json({ code: '0', msg: '推荐服务不可用（请先启动 recservice）', result: null });
  }
};

module.exports = {
  getRecommend,
  getRecommendDemo
};
