// 数据库事务工具：从连接池取一个独立连接，在一个事务里执行多个 SQL
// 用法：
//   const result = await withTransaction(async tx => {
//     await tx.query('INSERT ...', [...]);
//     return 数据;
//   });
// work 正常返回 → 提交事务并返回其结果；
// work 抛错 → 回滚事务并把错误抛给调用方；
// 无论成功失败都会释放连接。
const db = require('../db/index');

function getConnection() {
  return new Promise((resolve, reject) => {
    db.getConnection((err, connection) => {
      if (err) reject(err);
      else resolve(connection);
    });
  });
}

// 在事务连接上执行 SQL（事务内不要再用 db.query / queryPromise，否则不在同一事务里）
function query(connection, sql, params) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

async function withTransaction(work) {
  const connection = await getConnection();
  try {
    await new Promise((resolve, reject) => {
      connection.beginTransaction(err => (err ? reject(err) : resolve()));
    });
    const tx = {
      query: (sql, params) => query(connection, sql, params),
    };
    const result = await work(tx);
    await new Promise((resolve, reject) => {
      connection.commit(err => (err ? reject(err) : resolve()));
    });
    return result;
  } catch (err) {
    // 回滚即使失败也忽略，把原始错误抛给调用方
    await new Promise(resolve => connection.rollback(() => resolve()));
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { withTransaction };
