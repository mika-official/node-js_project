const { AlipayFormData } = require('alipay-sdk'); // 引入支付宝表单构造类
const alipaySdk = require('../config').alipaySdk; // 从配置文件引入支付宝SDK实例
const db = require('../db/index'); 


// 必须公网地址(ngrok映射)，支付宝异步通知用
const BASE_URL = 'https://82c42f.r2.cpolar.top';

// const goPay = (req, res) => {
//   const orderId = req.query.orderId;
//   console.log(orderId);
//   const redirectEncode = req.query.redirect;

//   // 参数校验
//   if (!orderId || !redirectEncode) {
//     return res.send('参数缺失：orderId / redirect');
//   }

//   // 解码回调地址
//   const returnUrl = decodeURIComponent(redirectEncode);

//   // 直接查询 order 表，获取订单信息
//   const sql = 'SELECT id, total_amount, buyer_message FROM `order` WHERE id = ?';
//   db.query(sql, [orderId], (err, results) => {
//     if (err) {
//       console.log(err);
//       return res.send('订单查询失败');
//     }
//     if (!results || results.length === 0) {
//       return res.send('订单不存在');
//     }

//     const order = results[0];

//     const bizContent = {
//       notifyUrl: `${BASE_URL}/pay/alipay/notify`,
//       returnUrl: returnUrl,
//       out_trade_no: order.id,
//       total_amount: order.total_amount.toFixed(2), // 金额必须保留两位小数
//       subject: order.buyer_message || 'abcd',
//       product_code: 'FAST_INSTANT_TRADE_PAY',
//     };
    


//     // 回调方式调用，生成自动提交表单
//     alipaySdk.pageExec(
//       'alipay.trade.page.pay',
//       bizContent,
//       (err, formHtml) => {
//         if (err) {
//           return res.send('支付宝支付创建失败');
//         }
//         console.log(formHtml);

//         // 直接返回表单HTML，自动跳转到支付宝收银台
//         res.send(formHtml);
//       }
//     );
//   });
// };

const goPay = async (req, res) => {
  try {
    // 1. 获取并校验参数
    const orderId = req.query.orderId;
    const redirectEncode = req.query.redirect;
    // 支付跳转是 <a> 链接，浏览器带不了 Authorization 头，
    // 该路由已在 app.js 中免鉴权；登录态存在时仍只允许支付自己的订单
    const userId = req.auth && req.auth.user_id;

    if (!orderId || !redirectEncode) {
      return res.send('参数缺失：orderId / redirect');
    }

    // 2. 解码回调地址，并附带 orderId 和支付结果标记（前端支付回跳页依赖这两个参数）
    const returnUrl = decodeURIComponent(redirectEncode);
    const sep = returnUrl.includes('?') ? '&' : '?';
    const returnUrlWithParams = `${returnUrl}${sep}orderId=${orderId}&payResult=true`;

    // 3. 查询订单信息（将 db.query 包装为 Promise）
    const sql = userId
      ? 'SELECT id, total_amount, buyer_message FROM `order` WHERE id = ? AND user_id = ?'
      : 'SELECT id, total_amount, buyer_message FROM `order` WHERE id = ?';
    const queryParams = userId ? [orderId, userId] : [orderId];
    const results = await new Promise((resolve, reject) => {
      db.query(sql, queryParams, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (!results || results.length === 0) {
      return res.send('订单不存在');
    }
    const order = results[0];

    // 4. 构造支付参数
    const params = {
      notifyUrl: `${BASE_URL}/pay/alipay/notify`,
      returnUrl: returnUrlWithParams,
      bizContent: {
        out_trade_no: order.id.toString(),
        total_amount: order.total_amount.toFixed(2), // 金额必须是字符串，保留两位小数
        subject: order.buyer_message || 'abcd',
        product_code: 'FAST_INSTANT_TRADE_PAY'
      }
    };

    // 5. 调用支付宝 SDK 生成支付表单（pageExec 是回调式 API，包成 Promise 等它完成后再返回）
    let formHtml;
    try {
      formHtml = await new Promise((resolve, reject) => {
        alipaySdk.pageExec('alipay.trade.page.pay', params, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
    } catch (err) {
      console.error('支付宝支付创建失败:', err); // 打印完整错误堆栈
      return res.send('支付宝支付创建失败');
    }

    // 6. 返回支付表单
    res.send(formHtml);

  } catch (err) {
    console.error('支付流程出错:', err); // 打印完整错误堆栈
    res.send('支付宝支付创建失败');
  }
};


// 支付宝异步通知：更新支付状态
const payNotify = (req, res) => {
  const notifyData = req.body;

  // 验签
  const isSignValid = alipaySdk.checkNotifySign(notifyData);
  if (!isSignValid) {
    return res.send('fail');
  }

  // 支付成功
  if (notifyData.trade_status === 'TRADE_SUCCESS') {
    const orderId = notifyData.out_trade_no;
    // 更新订单状态为已支付（order 表没有 pay_status 列，用 status 列）
    const updateSql = 'UPDATE `order` SET status = 1 WHERE id = ?';
    db.query(updateSql, [orderId], (err) => {
      res.send(err ? 'fail' : 'success');
    });
  } else {
    res.send('fail');
  }
};

module.exports = {
  goPay,
  payNotify,
};
