const db = require('../db');
const Snowflake = require('snowflake-id').default;
const snowflake = new Snowflake({
    mid: 42,
    offset: (2020 - 1970) * 365 * 24 * 3600 * 1000
});

const getMyGoods = async (req, res) => {
    try {
        // 1. 获取并校验参数
        const userId = req.auth.user_id;
        const userType = req.auth.user_type;
        if (!userId || userType !== '1') {
            return res.status(401).send('登录信息无效');
        }

        // 2. 解析分页参数（从 query 中取，默认第 1 页、每页 10 条）
        let page = parseInt(req.query.page) || 1;
        let pageSize = parseInt(req.query.pageSize) || 10;

        // 边界保护：防止负数或超大值
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 10;
        if (pageSize > 100) pageSize = 100;

        const offset = (page - 1) * pageSize;

        // 3. 并行查询：总数 + 当前页数据
        // product 表每个 SKU 一行，商家商品列表按商品(id)去重展示
        const countPromise = new Promise((resolve, reject) => {
            db.query(
                'SELECT COUNT(DISTINCT id) AS total FROM product WHERE seller_id = ?',
                [userId],
                (err, data) => {
                    if (err) reject(err);
                    else resolve(data[0].total);
                }
            );
        });

        const dataPromise = new Promise((resolve, reject) => {
            db.query(
                `SELECT p.name, p.price, p.\`desc\`, p.stock, p.picture
                 FROM product p
                 JOIN (SELECT id, MIN(skuid) AS skuid FROM product WHERE seller_id = ? GROUP BY id) t
                   ON t.skuid = p.skuid
                 ORDER BY p.id DESC LIMIT ? OFFSET ?`,
                [userId, Number(pageSize), Number(offset)],
                (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                }
            );
        });

        const [total, list] = await Promise.all([countPromise, dataPromise]);

        // 4. 返回分页结果
        res.json({
            code: 200,
            data: {
                list,
                total,                  // 总记录数
                page,                   // 当前页码
                pageSize,               // 每页条数
                totalPages: Math.ceil(total / pageSize)  // 总页数
            },
            msg: '查询商品成功'
        });
    } catch (err) {
        console.error('查询商品出错', err);
        res.send('查询商品失败');
    }
};

const addMyGoods = async (req, res) => {
    try {
        // 1. 获取并校验参数
        const userId = req.auth.user_id;
        const userType = req.auth.user_type;
        if (!userId || userType !== '1') {
            return res.status(401).send('登录信息无效');
        }

        const { name, price, desc, stock, picture } = req.body;
        const productId = snowflake.generate().toString();  // 商品主表 id
        const skuId = snowflake.generate().toString();       // SKU ID（供下单时引用）

        const sql = 'INSERT INTO product (id, skuid, seller_id, name, price, `desc`, stock, picture) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const results = await new Promise((resolve, reject) => {
            db.query(sql, [productId, skuId, userId, name, price, desc, stock, picture], (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
        res.json({ code: 200, data: { productId, skuId }, msg: '添加商品成功' });
    } catch (err) {
        console.error('添加商品出错', err); // 打印完整错误堆栈
        res.send('添加商品失败');
    }
};

const deleteMyGoods = async (req, res) => {
    try {
        // 1. 获取并校验参数
        const userId = req.auth.user_id;
        const userType = req.auth.user_type;
        if (!userId || userType !== '1') {
            return res.status(401).send('登录信息无效');
        }

        const { productId } = req.body;
        if (!productId) {
            return res.status(400).send('缺少商品ID');
        }
        const sql = 'DELETE FROM product WHERE id = ? AND seller_id = ?';
        const results = await new Promise((resolve, reject) => {
            db.query(sql, [productId, userId], (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
        res.json({ code: 200, data: { productId }, msg: '删除商品成功' });
    } catch (err) {
        console.error('删除商品出错', err); // 打印完整错误堆栈
        res.send('删除商品失败');
    }
};

module.exports = {
    getMyGoods,
    addMyGoods,
    deleteMyGoods
};