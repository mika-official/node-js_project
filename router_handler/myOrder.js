const db = require('../db');

const getMyOrder = async (req, res) => {
    try {
        // 1. 获取并校验参数
        const userId = req.auth.user_id;
        const userType = req.auth.user_type;
        if (!userId || userType !== '1') {
            return res.status(401).send('登录信息无效');
        }

        const sql = 'SELECT order_id FROM order_seller WHERE seller_id = ?';
        const results = await new Promise((resolve, reject) => {
            db.query(sql, [userId], (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        const sql1 = 'SELECT buyer_message, total_amount, create_time FROM `order` WHERE id IN (?)';

        const results1 = await new Promise((resolve, reject) => {
            db.query(sql1, [results.map(item => item.order_id)], (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        res.json({ code: 200, data: results1, msg: '查询订单成功' });
    } catch (err) {
        console.error('查询订单出错', err); // 打印完整错误堆栈
        res.send('查询订单失败');
    }
};

module.exports = {
    getMyOrder
};