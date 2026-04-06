const db = require('../db/index');
const jwt = require('jsonwebtoken');
const config = require('../config');

exports.login = (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(401).json({ message: '登录失败，用户名或密码为空' });
  }
  // 验证用户名和密码是否正确
  // 从数据库中查询用户信息
  const sql = 'SELECT * FROM user WHERE username = ?';
  db.query(sql, [username], (err, results) => {
    if (err) {
      return res.status(500).json({ message: '登录失败，服务器错误' });
    }
    if (results.length === 0) {
      return res.status(401).json({ message: '登录失败，用户名不存在' });
    }
    const user = results[0];
    if (user.password !== password) {
      return res.status(401).json({ message: '登录失败，密码错误' });
    }
    // 用户名和密码验证成功，登录成功
    const userInfo = {...user, password:'', avatar:''};
    // 生成JWT令牌
    const tokenStr = jwt.sign(userInfo, config.jwtSecret, { expiresIn: '8h' });
    const token = 'Bearer ' + tokenStr;
    res.json({ status: 0, message: '登录成功', data:{token,userInfo} });
  });
}