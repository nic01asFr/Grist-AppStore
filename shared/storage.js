/**
 * Grist AppStore — Stockage persistant
 * Primitives : config (Preferences/localStorage), queue offline (IndexedDB)
 */

// ─── Config Store (clé/valeur sérialisé) ───
class AppStorage {
  constructor(key) { this.key = key; }

  async load() {
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        const r = await window.Capacitor.Plugins.Preferences.get({ key: this.key });
        return r.value ? JSON.parse(r.value) : null;
      }
    } catch(_) {}
    try {
      const v = localStorage.getItem(this.key);
      return v ? JSON.parse(v) : null;
    } catch(_) { return null; }
  }

  async save(data) {
    const s = JSON.stringify(data);
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        await window.Capacitor.Plugins.Preferences.set({ key: this.key, value: s });
        return;
      }
    } catch(_) {}
    try { localStorage.setItem(this.key, s); } catch(_) {}
  }

  async clear() {
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        await window.Capacitor.Plugins.Preferences.remove({ key: this.key });
        return;
      }
    } catch(_) {}
    try { localStorage.removeItem(this.key); } catch(_) {}
  }
}

// ─── Offline Queue (IndexedDB — persist pending records across restarts) ───
class OfflineQueue {
  constructor(dbName = 'grist-app-queue', storeName = 'pending') {
    this.dbName    = dbName;
    this.storeName = storeName;
    this._db       = null;
  }

  async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName, { keyPath: '_queueId', autoIncrement: true });
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror   = () => reject(req.error);
    });
  }

  async enqueue(record) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).add({ ...record, _queuedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async dequeueAll() {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req   = store.getAll();
      req.onsuccess = () => {
        const records = req.result;
        store.clear();
        resolve(records.map(r => { delete r._queueId; delete r._queuedAt; return r; }));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async count() {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async peek(limit = 10) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).getAll(null, limit);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
}
