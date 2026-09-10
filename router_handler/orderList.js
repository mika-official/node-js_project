const db = require('../db/index');

// 数据库查询的 Promise 包装器
function queryPromise(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// 格式化 datetime 为 'YYYY-MM-DD HH:mm:ss'（mysql2 返回 Date 对象，直接 JSON 会带时区）
function formatTime(d) {
  const t = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}

// 待支付订单的付款倒计时（秒）：本地约定下单后 30 分钟内需完成支付
const PAY_DEADLINE_SECONDS = 30 * 60;
function getCountdown(order) {
  if (order.status !== 0) return 0;
  const elapsed = (Date.now() - new Date(order.create_time).getTime()) / 1000;
  return Math.max(0, Math.ceil(PAY_DEADLINE_SECONDS - elapsed));
}

// 买家订单列表（前端"我的订单"页）
// 参数：orderState 0=全部 1=待付款 2=待发货 ...（ithema 语义），page、pageSize
// 本地 order.status 与 itheima orderState 的关系：orderState = status + 1
const getOrderList = async (req, res) => {
  try {
    const userId = req.auth && req.auth.user_id;
    if (!userId) {
      return res.status(401).json({ code: '0', msg: '未登录', result: null });
    }

    let { orderState = 0, page = 1, pageSize = 2 } = req.query;
    orderState = parseInt(orderState, 10) || 0;
    page = Math.max(1, parseInt(page, 10) || 1);
    pageSize = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 2));

    let where = 'user_id = ?';
    const params = [userId];
    if (orderState >= 1 && orderState <= 6) {
      where += ' AND status = ?';
      params.push(orderState - 1);
    }

    const countRows = await queryPromise(
      `SELECT COUNT(*) AS counts FROM \`order\` WHERE ${where}`,
      params
    );
    const counts = countRows[0].counts;

    const orders = await queryPromise(
      `SELECT id, total_amount, status, create_time FROM \`order\`
       WHERE ${where} ORDER BY create_time DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    // 批量查询订单商品，避免逐单查库
    const orderIds = orders.map((o) => o.id);
    const skuMap = {};
    if (orderIds.length > 0) {
      const skuRows = await queryPromise(
        `SELECT op.order_id, op.skuid, op.count, op.price,
                p.name, p.picture, p.\`desc\`, p.post_fee
         FROM order_product op
         JOIN product p ON op.skuid = p.skuid
         WHERE op.order_id IN (?)`,
        [orderIds]
      );
      skuRows.forEach((row) => {
        if (!skuMap[row.order_id]) skuMap[row.order_id] = [];
        skuMap[row.order_id].push(row);
      });
    }

    const items = orders.map((order) => {
      const skus = (skuMap[order.id] || []).map((row) => ({
        id: row.skuid,
        image: row.picture,
        name: row.name,
        attrsText: row.desc,
        realPay: Number(row.price),
        quantity: row.count
      }));
      const postFee = skuMap[order.id]
        ? skuMap[order.id].reduce((sum, row) => sum + Number(row.post_fee || 0), 0)
        : 0;
      return {
        id: order.id,
        createTime: formatTime(order.create_time),
        orderState: order.status + 1,
        countdown: getCountdown(order),
        skus,
        payMoney: Number(order.total_amount),
        postFee
      };
    });

    res.json({
      code: '1',
      msg: '查询订单成功',
      result: { counts, page, pageSize, items }
    });
  } catch (err) {
    console.error('查询订单列表出错:', err);
    res.status(500).json({ code: '0', msg: '服务器异常', result: null });
  }
};

// 订单支付信息（支付页 / 支付回跳页展示金额和倒计时用）
const getOrderPayInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.auth && req.auth.user_id;
    if (!userId) {
      return res.status(401).json({ code: '0', msg: '未登录', result: null });
    }
    const rows = await queryPromise(
      'SELECT id, total_amount, status, create_time FROM `order` WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ code: '0', msg: '订单不存在', result: null });
    }
    const order = rows[0];
    res.json({
      code: '1',
      msg: '获取订单支付信息成功',
      result: {
        id: order.id,
        payMoney: Number(order.total_amount),
        countdown: getCountdown(order),
        orderState: order.status + 1
      }
    });
  } catch (err) {
    console.error('查询订单支付信息出错:', err);
    res.status(500).json({ code: '0', msg: '服务器异常', result: null });
  }
};

module.exports = {
  getOrderList,
  getOrderPayInfo
};
