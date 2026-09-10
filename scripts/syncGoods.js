// 从黑马（itheima）公开接口同步商品数据到本地 product 表
// 用途：前端商品浏览仍走黑马接口，用户把黑马商品加入购物车后，
//       本地购物车/订单接口按 skuid JOIN product 表，没有这些数据就会"商品不存在"或列表为空。
// 用法：node scripts/syncGoods.js [--limit N]（默认上限 400 个 SPU）
const db = require('../db/index');

const BASE = 'https://pcapi-xiaotuxian-front-devtest.itheima.net';
const SELLER_ID = '2'; // 导入商品挂在本地商家（gay, user_id=2）名下
const DEFAULT_STOCK = 100; // 黑马库存为 0 的 SKU 用默认库存，避免本地加购报"库存不足"
const MAX_ID_LEN = 20; // 本地表 id/skuid 都是 varchar(20)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// 从黑马各公开列表接口收集 SPU id（按前端实际浏览入口）
async function collectSpuIds() {
  const ids = []; // 保持顺序：首页/新品/热门优先
  const seen = new Set();
  const push = (list) => {
    (list || []).forEach((g) => {
      if (g && g.id && !seen.has(g.id)) {
        seen.add(g.id);
        ids.push(String(g.id));
      }
    });
  };

  // 1. 首页分类下的商品
  const homeGoods = await fetchJson(`${BASE}/home/goods`);
  (homeGoods.result || []).forEach((c) => push(c.goods));

  // 2. 新品
  const homeNew = await fetchJson(`${BASE}/home/new`);
  push(homeNew.result);

  // 3. 热门商品
  const hot = await fetchJson(`${BASE}/goods/hot?id=1&type=1&limit=50`);
  push(hot.result);

  // 4. 每个一级分类取前 30 个商品（前端分类页浏览入口）
  const heads = await fetchJson(`${BASE}/home/category/head`);
  for (const cat of heads.result || []) {
    try {
      const res = await fetchJson(`${BASE}/category/goods/temporary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: cat.id, page: 1, pageSize: 30, sortField: 'publishTime', sortMethod: 'desc' })
      });
      push((res.result || {}).items);
    } catch (err) {
      console.warn(`分类 ${cat.id}(${cat.name}) 拉取失败:`, err.message);
    }
  }

  return ids;
}

// 拉取 SPU 详情，返回该 SPU 下的所有 SKU 行
async function fetchSkuRows(spuId) {
  const detail = await fetchJson(`${BASE}/goods?id=${spuId}`);
  const spu = detail.result;
  if (!spu || !Array.isArray(spu.skus) || spu.skus.length === 0) {
    return null; // 无详情或无 SKU，跳过
  }
  const spuIdStr = String(spu.id);
  if (spuIdStr.length > MAX_ID_LEN) return null;

  const rows = [];
  for (const sku of spu.skus) {
    const skuId = String(sku.id);
    if (skuId.length > MAX_ID_LEN) continue;
    const price = sku.price || spu.price || '0.00';
    const stock = Number(sku.inventory) > 0 ? Number(sku.inventory) : DEFAULT_STOCK;
    rows.push([
      spuIdStr, // id：SPU id
      skuId, // skuid
      SELLER_ID, // seller_id
      String(spu.name || '').slice(0, 255), // name
      price, // price
      String(spu.desc || '').slice(0,255), // desc
      stock, // stock
      (spu.mainPictures || [])[0] || null, // picture
      String(spu.discount ?? '').slice(0, 50), // discount
      Number(spu.salesCount) || 0, // order_num
      price, // now_price
      sku.oldPrice || spu.oldPrice || price, // now_original_price
      0, // post_fee
      price, // pay_price
      Number(spu.salesCount) || 0 // hot_score
    ]);
  }
  return rows;
}

async function upsert(rows) {
  if (rows.length === 0) return;
  return new Promise((resolve, reject) => {
    db.query(
      `INSERT INTO product
         (id, skuid, seller_id, name, price, \`desc\`, stock, picture, discount,
          order_num, now_price, now_original_price, post_fee, pay_price, hot_score)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), price = VALUES(price), \`desc\` = VALUES(\`desc\`),
         stock = VALUES(stock), picture = VALUES(picture), discount = VALUES(discount),
         order_num = VALUES(order_num), now_price = VALUES(now_price),
         now_original_price = VALUES(now_original_price), post_fee = VALUES(post_fee),
         pay_price = VALUES(pay_price), hot_score = VALUES(hot_score)`,
      [rows],
      (err, results) => (err ? reject(err) : resolve(results))
    );
  });
}

// 小并发池：最多 5 个详情请求同时在飞，请求间留 50ms 间隔
async function pool(items, worker, size = 5, delayMs = 50) {
  const results = [];
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results.push(await worker(items[i]));
      } catch (err) {
        console.warn(`SPU ${items[i]} 详情拉取失败:`, err.message);
        results.push(null);
      }
      await sleep(delayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 400;

  console.log('收集黑马商品 SPU id ...');
  const spuIds = await collectSpuIds();
  console.log(`共收集到 ${spuIds.length} 个 SPU，取前 ${LIMIT} 个`);
  const selected = spuIds.slice(0, LIMIT);

  console.log('拉取详情并生成 SKU 行 ...');
  const skuRowsGroups = await pool(selected, fetchSkuRows);

  const rows = skuRowsGroups.flatMap((g) => g || []);
  console.log(`有效 SKU 行数：${rows.length}`);

  console.log('写入本地 product 表 ...');
  await upsert(rows);
  console.log('完成。');

  process.exit(0);
}

main().catch((err) => {
  console.error('同步失败:', err);
  process.exit(1);
});
