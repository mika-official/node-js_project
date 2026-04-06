// 配置文件
const { AlipaySdk } = require('alipay-sdk');
const alipaySdk = new AlipaySdk({
  appId: '',
  privateKey: '',
  alipayPublicKey: '',
  gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do', // 沙箱环境
  timeout: 50000,
});

module.exports = {
  jwtSecret: 'sidecar',
  alipaySdk: alipaySdk
}