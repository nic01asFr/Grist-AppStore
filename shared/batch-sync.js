/**
 * Grist AppStore — Synchronisation par batch
 * Primitives : buffer → dédup → flush → retry → offline queue
 */

class BatchSync {
  constructor(opts = {}) {
    this.client      = opts.client;       // GristClient
    this.tableId     = opts.tableId;
    this.flushMs     = opts.flushMs     || 3000;
    this.maxBuffer   = opts.maxBuffer   || 500;
    this.onFlush     = opts.onFlush     || null;
    this.onError     = opts.onError     || null;
    this.offlineQueue = opts.offlineQueue || null; // OfflineQueue instance

    this._buffer   = [];
    this._timer    = null;
    this._synced   = 0;
    this._failed   = 0;
  }

  get pending()    { return this._buffer.length; }
  get synced()     { return this._synced; }
  get failed()     { return this._failed; }
  get running()    { return this._timer !== null; }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this.flush(), this.flushMs);
    this._drainOfflineQueue();
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  push(record) {
    this._buffer.push(record);
    if (this._buffer.length >= this.maxBuffer) this.flush();
  }

  pushMany(records) {
    this._buffer.push(...records);
    if (this._buffer.length >= this.maxBuffer) this.flush();
  }

  async flush() {
    if (!this._buffer.length) return;
    if (!this.client || !this.client.configured || !this.tableId) {
      if (this.offlineQueue) {
        for (const r of this._buffer) await this.offlineQueue.enqueue(r);
        this._buffer = [];
      }
      return;
    }

    const batch = this._buffer.splice(0, this._buffer.length);
    try {
      const ok = await this.client.pushRecords(this.tableId, batch);
      if (ok) {
        this._synced += batch.length;
        if (this.onFlush) this.onFlush(batch.length, this._synced);
      } else {
        throw new Error('Push failed');
      }
    } catch(e) {
      this._failed += batch.length;
      if (this.offlineQueue) {
        for (const r of batch) await this.offlineQueue.enqueue(r);
      } else {
        this._buffer.unshift(...batch);
      }
      if (this.onError) this.onError(e, batch.length);
    }
  }

  async _drainOfflineQueue() {
    if (!this.offlineQueue || !this.client?.configured) return;
    try {
      const queued = await this.offlineQueue.dequeueAll();
      if (queued.length) this.pushMany(queued);
    } catch(_) {}
  }

  reset() {
    this._buffer = [];
    this._synced = 0;
    this._failed = 0;
  }
}

// ─── Déduplification spatiale/temporelle ───
class DetectionDedup {
  constructor(opts = {}) {
    this.cooldownMs = opts.cooldownMs || 5000;
    this.iouThreshold = opts.iouThreshold || 0.3;
    this._last = {};
  }

  shouldRecord(key, bbox, now) {
    now = now || Date.now();
    if (this.cooldownMs === 0) return true;

    const prev = this._last[key];
    if (!prev) { this._last[key] = { time: now, bbox }; return true; }
    if ((now - prev.time) > this.cooldownMs) { this._last[key] = { time: now, bbox }; return true; }
    if (bbox && prev.bbox && this._iou(prev.bbox, bbox) < this.iouThreshold) {
      this._last[key] = { time: now, bbox };
      return true;
    }
    return false;
  }

  reset() { this._last = {}; }

  _iou(a, b) {
    const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[0]+a[2], b[0]+b[2]), y2 = Math.min(a[1]+a[3], b[1]+b[3]);
    if (x2 <= x1 || y2 <= y1) return 0;
    const inter = (x2 - x1) * (y2 - y1);
    return inter / (a[2]*a[3] + b[2]*b[3] - inter);
  }
}
