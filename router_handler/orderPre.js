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
      const userAddresses = addressRows.map((addr) => ({
        id: addr.id,
        receiver: addr.receiver,
        contact: addr.contact,
        provinceCode: addr.province_code,
        cityCode: addr.city_code,
        countyCode: addr.county_code,
        address: addr.address,
        fullLocation: addr.full_location,
        postalCode: addr.postal_code,
        addressTags: addr.address_tags
      }));

      // --- 步骤2：查询购物车中选中的商品 ---
      db.query(
        `SELECT 
          c.cart_id, c.product_id, c.skuid, c.count,
          p.name, p.picture,
          p.desc, p.price, p.pay_price
        FROM cart c
        JOIN product p ON c.product_id = p.id
        WHERE c.user_id = ? AND c.selected = 1`,
        [userId],
        (err, cartRows) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ code: '0', msg: '服务器错误' });
          }

          // 映射商品数据（价格单位为元，直接使用）
          const goods = cartRows.map((item) => ({
            id: item.goods_id,
            name: item.name,
            picture: item.picture,
            count: item.count,
            skuId: item.skuid,
            attrsText: item.desc,
            price: item.price.toFixed(2), // 直接保留两位小数
            payPrice: item.pay_price.toFixed(2),
            totalPrice: (item.price * item.count).toFixed(2),
            totalPayPrice: (item.pay_price * item.count).toFixed(2)
          }));

          // --- 步骤3：计算订单摘要 ---
          const goodsCount = goods.reduce((sum, item) => sum + item.count, 0);
          const totalPrice = goods.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0);
          const discountPrice = 0; // 可根据优惠规则计算
          const postFee = 5; // 可根据地址和商品重量计算
          const totalPayPrice = totalPrice - discountPrice + postFee;

          const summary = {
            goodsCount,
            totalPrice: totalPrice.toFixed(2),
            totalPayPrice: totalPayPrice.toFixed(2),
            postFee: postFee.toFixed(2),
            discountPrice: discountPrice.toFixed(2)
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
