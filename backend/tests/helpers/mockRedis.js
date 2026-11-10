/**
 * In-memory Redis mock implementing TTL, EX, get, set, del, ttl, and flushall
 * for deterministic unit and integration testing without a live Redis server.
 */
export class MockRedis {
  constructor() {
    this.store = new Map();
    this.timeOffsetMs = 0;
  }

  _now() {
    return Date.now() + this.timeOffsetMs;
  }

  _isExpired(entry) {
    return entry.expiresAt !== null && this._now() >= entry.expiresAt;
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this._isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, mode, durationSeconds) {
    let expiresAt = null;
    if (mode === 'EX' && typeof durationSeconds === 'number') {
      expiresAt = this._now() + durationSeconds * 1000;
    }
    this.store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async ttl(key) {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (this._isExpired(entry)) {
      this.store.delete(key);
      return -2;
    }
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - this._now()) / 1000));
  }

  async del(key) {
    return this.store.delete(key) ? 1 : 0;
  }

  async flushall() {
    this.store.clear();
    this.timeOffsetMs = 0;
    return 'OK';
  }

  /**
   * Advance simulated clock by `seconds` to test TTL expiration deterministically.
   */
  advanceTime(seconds) {
    this.timeOffsetMs += seconds * 1000;
  }

  async quit() {
    this.store.clear();
    return 'OK';
  }
}

