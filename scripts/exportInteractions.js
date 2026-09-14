// 导出本地业务交互数据为训练格式 CSV（供 recservice/train.py --local-file 合并训练）
// 来源：order_product（购买，weight=3）+ cart（加购，weight=2）
// 输出：recservice/data/local_events.csv，列：visitorid,itemid,timestamp,weight
// 用法：node scripts/exportInteractions.js
const fs = require('fs');
const path = require('path');
const db = require('../db/index');

function queryPromise(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

async function main() {
  const rows = [];
  // 本地 id 加 local_ 前缀，避免与 RetailRocket 数据集里的同名 id 冲突
  const L = (s) => `local_${s}`;

  // 1. 购买行为：order_product JOIN order，weight=3（强信号）
  const orders = await queryPromise(
    `SELECT o.user_id AS visitorid, op.skuid AS itemid, o.create_time AS timestamp
     FROM \`order\` o
     JOIN order_product op ON op.order_id = o.id`
  );
  orders.forEach((r) => rows.push([
    L(r.visitorid),
    L(r.itemid),
    Math.floor(new Date(r.timestamp).getTime() / 1000), // 秒级时间戳
    3
  ]));

  // 2. 加购行为：cart，weight=2
  const cartRows = await queryPromise(
    'SELECT user_id AS visitorid, skuid AS itemid, NULL AS timestamp FROM cart'
  );
  cartRows.forEach((r) => rows.push([
    L(r.visitorid),
    L(r.itemid),
    Math.floor((r.timestamp ? new Date(r.timestamp).getTime() : Date.now()) / 1000),
    2
  ]));

  // 3. 点赞/收藏行为（训练打分的最强标准）：like=4、collect=5
  const favorRows = await queryPromise(
    'SELECT user_id AS visitorid, skuid AS itemid, action, create_time AS timestamp FROM user_favor'
  );
  favorRows.forEach((r) => rows.push([
    L(r.visitorid),
    L(r.itemid),
    Math.floor(new Date(r.timestamp).getTime() / 1000),
    r.action === 'collect' ? 5 : 4
  ]));

  if (rows.length === 0) {
    console.log('本地无交互数据可导出（订单表和购物车表都为空）');
    return;
  }

  const outDir = path.join(__dirname, '..', 'recservice', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'local_events.csv');
  const csv = ['visitorid,itemid,timestamp,weight']
    .concat(rows.map((r) => r.join(',')))
    .join('\n');
  fs.writeFileSync(outPath, csv, 'utf-8');
  console.log(`已导出 ${rows.length} 条本地交互 -> ${outPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('导出失败:', err);
  process.exit(1);
});
