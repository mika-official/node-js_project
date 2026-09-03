/**
 * 内存缓存，支持 TTL 过期、LRU 容量上限、single-flight 防击穿、命中统计
 *
 * 用法（兼容旧接口）：
 *   cache.set(key, value, ttlMs)   // 写入，带 TTL（实际过期时间随机上浮 0~10%，防雪崩）
 *   cache.get(key)                 // 读取，命中返回数据，未命中/已过期返回 null
 *   cache.del(key)                 // 删除单个 key
 *   cache.delByPrefix(prefix)      // 按前缀批量删除，返回删除条数
 *   cache.clear()                  // 清空
 *
 * 新用法（防击穿）：
 *   const data = await cache.getOrLoad(key, async () => 查库, ttlMs)
 *   // 同一 key 并发 miss 时只执行一次 loader，其余请求等同一个 Promise
 *
 * 统计：
 *   cache.getStats()  // { size, maxEntries, hits, misses, hitRate, evictions }
 */
class MemoryCache {
  constructor(options = {}) {
    this._store = new Map(); // key -> { value, expiry }，Map 插入顺序即 LRU 顺序
    // 最大条目数，超出时淘汰最久未使用的条目；0 表示不缓存
    this._maxEntries = options.maxEntries === undefined ? 500 : options.maxEntries;
    // TTL 随机上浮比例（0~ratio），避免一批同时写入的 key 同时过期
    this._jitterRatio = options.jitterRatio === undefined ? 0.1 : options.jitterRatio;
    this._inFlight = new Map(); // key -> Promise，single-flight 用
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (Date.now() > entry.expiry) {
      // 已过期，懒删除
      this._store.delete(key);
      this._misses++;
      return null;
    }
    // LRU：删除再插入，把 key 移到 Map 末尾（最近使用）
    this._store.delete(key);
    this._store.set(key, entry);
    this._hits++;
    return entry.value;
  }

  set(key, value, ttlMs) {
    // TTL 随机上浮，防止缓存雪崩
    const actualTtl = ttlMs + Math.floor(Math.random() * ttlMs * this._jitterRatio);
    const entry = { value, expiry: Date.now() + actualTtl };
    if (this._store.has(key)) {
      this._store.delete(key);
    }
    this._store.set(key, entry);
    // 超出容量时从 Map 头部（最久未使用）开始淘汰
    while (this._store.size > this._maxEntries) {
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
      this._evictions++;
    }
  }

  del(key) {
    return this._store.delete(key);
  }

  // 按前缀批量删除，返回删除条数
  // 数据变更后按需调用，如商品/库存更新后 delByPrefix('hot_') 清掉热门列表缓存
  delByPrefix(prefix) {
    let deleted = 0;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  clear() {
    this._store.clear();
    this._inFlight.clear();
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  /**
   * 读缓存，未命中时执行 loader 并写回缓存（cache-aside）
   * 同一 key 并发 miss 时只执行一次 loader，其余请求等同一个 Promise（防缓存击穿）
   * loader 抛错不缓存，错误抛给所有等待者
   */
  async getOrLoad(key, loader, ttlMs) {
    const cached = this.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const pending = this._inFlight.get(key);
    if (pending) {
      return pending;
    }

    const promise = Promise.resolve()
      .then(() => loader())
      .then(value => {
        this._inFlight.delete(key);
        this.set(key, value, ttlMs);
        return value;
      })
      .catch(err => {
        this._inFlight.delete(key);
        throw err;
      });
    this._inFlight.set(key, promise);
    return promise;
  }

  getStats() {
    const total = this._hits + this._misses;
    return {
      size: this._store.size,
      maxEntries: this._maxEntries,
      hits: this._hits,
      misses: this._misses,
      hitRate: total === 0 ? 0 : this._hits / total,
      evictions: this._evictions,
    };
  }
}

const instance = new MemoryCache();
instance.MemoryCache = MemoryCache; // 顺便导出类，便于测试或创建独立实例

module.exports = instance;
