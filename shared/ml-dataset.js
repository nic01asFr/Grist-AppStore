/**
 * Grist AppStore — ML Dataset Management
 * Capture, stockage, validation, export COCO JSON
 */

class MLDataset {
  constructor(opts = {}) {
    this.dbName    = opts.dbName || 'ml-dataset';
    this.storeName = 'samples';
    this._db       = null;
  }

  async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('label', 'label', { unique: false });
          store.createIndex('validated', 'validated', { unique: false });
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror   = () => reject(req.error);
    });
  }

  async capture(imageBlob, label, opts = {}) {
    const db = await this._open();
    const sample = {
      image:     imageBlob,
      label:     label,
      bbox:      opts.bbox || null,
      validated: opts.validated || false,
      source:    opts.source || 'lite',
      agent:     opts.agent || null,
      sessionId: opts.sessionId || null,
      confidence: opts.confidence || null,
      modelVersion: opts.modelVersion || null,
      latitude:  opts.latitude || null,
      longitude: opts.longitude || null,
      date:      Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const req = tx.objectStore(this.storeName).add(sample);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async getSample(id) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async listSamples(filter = {}) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).getAll();
      req.onsuccess = () => {
        let results = req.result;
        if (filter.label)     results = results.filter(s => s.label === filter.label);
        if (filter.validated != null) results = results.filter(s => s.validated === filter.validated);
        if (filter.source)    results = results.filter(s => s.source === filter.source);
        if (filter.hasBbox)   results = results.filter(s => !!s.bbox);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async validateSample(id, corrections = {}) {
    const db = await this._open();
    const sample = await this.getSample(id);
    if (!sample) return;
    Object.assign(sample, corrections, { validated: true });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(sample);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async rejectSample(id) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async getClassStats() {
    const samples = await this.listSamples();
    const stats = {};
    samples.forEach(s => {
      if (!stats[s.label]) stats[s.label] = { total: 0, validated: 0, withBbox: 0 };
      stats[s.label].total++;
      if (s.validated) stats[s.label].validated++;
      if (s.bbox) stats[s.label].withBbox++;
    });
    return stats;
  }

  async getLabels() {
    const stats = await this.getClassStats();
    return Object.keys(stats);
  }

  async count() {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async exportCOCO() {
    const samples = await this.listSamples({ validated: true });
    const labels = [...new Set(samples.map(s => s.label))];
    const categories = labels.map((name, i) => ({ id: i + 1, name }));
    const catMap = Object.fromEntries(categories.map(c => [c.name, c.id]));

    const images = [];
    const annotations = [];
    let annId = 1;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const img = await createImageBitmap(s.image);
      images.push({ id: i + 1, file_name: `img_${i + 1}.jpg`, width: img.width, height: img.height });

      if (s.bbox && Array.isArray(s.bbox)) {
        for (const box of s.bbox) {
          annotations.push({
            id: annId++, image_id: i + 1, category_id: catMap[box.label || s.label],
            bbox: [box.x, box.y, box.w, box.h], area: box.w * box.h, iscrowd: 0
          });
        }
      } else {
        annotations.push({
          id: annId++, image_id: i + 1, category_id: catMap[s.label],
          bbox: [0, 0, img.width, img.height], area: img.width * img.height, iscrowd: 0
        });
      }
    }

    return { images, annotations, categories, _samples: samples };
  }

  async clear() {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }
}
