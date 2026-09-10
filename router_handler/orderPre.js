const db = require('../db/index');
// 接口实现：获取订单预览信息
const getOrderPre = (req, res) => {
  const userId = req.auth.user_id; 

  // --- 步骤1：查询用户收货地址 ---
  db.query(
    'SELECT * FROM user_address WHERE user_id = ?',
    [userId],
    (err, addressRows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ code: '0', msg: '服务器错误' });
      }

      // 映射地址数据
      // isDefault：表里有 is_default 列就用它；没有则默认第一条为默认地址（前端依赖 isDefault === 0 找默认地址）
      const userAddresses = addressRows.map((addr, index) => ({
        id: addr.id,
        receiver: addr.receiver,
        contact: addr.contact,
        provinceCode: addr.province_code,
        cityCode: addr.city_code,
        countyCode: addr.county_code,
        address: addr.address,
        fullLocation: addr.full_location,
        postalCode: addr.postal_code,
        addressTags: addr.address_tags,
        isDefault: addr.is_default !== undefined ? addr.is_default : (index === 0 ? 0 : 1)
      }));

      // --- 步骤2：查询购物车中选中的商品 ---
      // 注意：product 表每个 SKU 一行（复合主键 id+skuid），必须按 skuid 关联，
      // 按 product_id 关联会一条购物车记录膨胀成该商品所有 SKU 行
      db.query(
        `SELECT
          c.cart_id, c.product_id, c.skuid, c.count,
          p.name, p.picture,
          p.desc, p.price, p.pay_price
        FROM cart c
        JOIN product p ON c.skuid = p.skuid
        WHERE c.user_id = ? AND c.selected = 1`,
        [userId],
        (err, cartRows) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ code: '0', msg: '服务器错误' });
          }

          // 映射商品数据（mysql2 返回的 DECIMAL 是字符串，不能直接调 toFixed，先转数值）
          const fmt2 = (n) => Number(n || 0).toFixed(2);
          const goods = cartRows.map((item) => ({
            id: item.product_id,
            name: item.name,
            picture: item.picture,
            count: item.count,
            skuId: item.skuid,
            attrsText: item.desc,
            price: fmt2(item.price),
            payPrice: fmt2(item.pay_price),
            totalPrice: fmt2(item.price * item.count),
            totalPayPrice: fmt2(item.pay_price * item.count)
          }));

          // --- 步骤3：计算订单摘要 ---
          // 注意：前端对 summary 字段调用 .toFixed(2)，必须是数值类型，不能返回字符串
          const goodsCount = goods.reduce((sum, item) => sum + item.count, 0);
          const totalPrice = goods.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0);
          const discountPrice = 0; // 可根据优惠规则计算
          const postFee = 5; // 可根据地址和商品重量计算
          const totalPayPrice = totalPrice - discountPrice + postFee;

          const round2 = (n) => Math.round(n * 100) / 100;
          const summary = {
            goodsCount,
            totalPrice: round2(totalPrice),
            totalPayPrice: round2(totalPayPrice),
            postFee: round2(postFee),
            discountPrice: round2(discountPrice)
          };

          // --- 步骤4：组装并返回数据 ---
          res.json({
            code: '1',
            msg: '操作成功',
            result: {
              userAddresses,
              goods,
              summary
            }
          });
        }
      );
    }
  );
};

module.exports = {
  getOrderPre
}
