// 配置文件
require('dotenv').config(); // 加载 .env 中的环境变量

// alipay-sdk v3 通过 default 导出构造器（v4 是命名导出，两种都兼容）
const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk').AlipaySdk || require('alipay-sdk');
const alipaySdk = new AlipaySdk({
  appId: process.env.ALIPAY_APP_ID,
  privateKey: process.env.ALIPAY_PRIVATE_KEY,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
  gateway: process.env.ALIPAY_GATEWAY, // 沙箱环境
  timeout: 50000,
});

module.exports = {
  jwtSecret: 'sidecar',
  alipaySdk: alipaySdk
}