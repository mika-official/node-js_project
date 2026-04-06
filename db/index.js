const mysql = require('mysql2');

//创建数据库连接对象
const db = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '12321',
  database: 'r_database'
});

module.exports = db;
