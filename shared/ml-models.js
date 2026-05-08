/**
 * Grist AppStore — ML Model Management
 * Load, version, switch, A/B test, feedback
 */

class MLModelManager {
  constructor(opts = {}) {
    this.models     = {};
    this.active     = null;
    this.metrics    = {};
    this.gristTable = opts.gristTable || 'ML_Models';
    this.client     = opts.client || null;
  }

  async loadTFJS(name, source) {
    const model = await tf.loadLayersModel(source);
    this.models[name] = { model, type: 'tfjs', source, loadedAt: Date.now() };
    return model;
  }

  async loadMediaPipe(name, modelPath, opts = {}) {
    const { FilesetResolver, ObjectDetector } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs'
    );
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );
    const detector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath },
      scoreThreshold: opts.threshold || 0.5,
      maxResults: opts.maxResults || 20,
      runningMode: opts.runningMode || 'VIDEO',
    });
    this.models[name] = { model: detector, type: 'mediapipe', source: modelPath, loadedAt: Date.now() };
    return detector;
  }

  async loadFromIndexedDB(name) {
    try {
      const model = await tf.loadLayersModel(`indexeddb://${name}`);
      this.models[name] = { model, type: 'tfjs-local', source: `indexeddb://${name}`, loadedAt: Date.now() };
      return model;
    } catch(_) { return null; }
  }

  async loadFromURL(name, url, type = 'tfjs') {
    if (type === 'tfjs') return this.loadTFJS(name, url);
    if (type === 'mediapipe') return this.loadMediaPipe(name, url);
    return null;
  }

  activate(name) {
    if (!this.models[name]) return false;
    this.active = name;
    return true;
  }

  getActive() {
    if (!this.active || !this.models[this.active]) return null;
    return this.models[this.active];
  }

  predict(input) {
    const m = this.getActive();
    if (!m) return null;
    if (m.type === 'mediapipe') {
      return m.model.detectForVideo(input, performance.now());
    }
    return m.model.predict(input);
  }

  recordFeedback(modelName, predicted, correct, confidence) {
    if (!this.metrics[modelName]) this.metrics[modelName] = { correct: 0, incorrect: 0, total: 0 };
    this.metrics[modelName].total++;
    if (predicted === correct) this.metrics[modelName].correct++;
    else this.metrics[modelName].incorrect++;
  }

  getAccuracy(modelName) {
    const m = this.metrics[modelName];
    if (!m || !m.total) return null;
    return m.correct / m.total;
  }

  listLoaded() {
    return Object.entries(this.models).map(([name, info]) => ({
      name, type: info.type, source: info.source, loadedAt: info.loadedAt,
      active: name === this.active,
      accuracy: this.getAccuracy(name),
    }));
  }

  async saveToIndexedDB(name, model) {
    await model.save(`indexeddb://${name}`);
  }

  async syncModelsFromGrist() {
    if (!this.client?.configured) return [];
    try {
      const records = await this.client.fetchRecords(this.gristTable, { filter: { active: [true] } });
      return records.map(r => ({
        name: r.fields.name,
        version: r.fields.version,
        type: r.fields.type,
        url: r.fields.model_url,
        accuracy: r.fields.accuracy,
      }));
    } catch(_) { return []; }
  }

  async pushMetricsToGrist(modelName) {
    if (!this.client?.configured) return;
    const acc = this.getAccuracy(modelName);
    if (acc == null) return;
    try {
      await this.client.upsertRecords(this.gristTable, [{
        require: { name: modelName },
        fields: { field_accuracy: Math.round(acc * 100) }
      }]);
    } catch(_) {}
  }

  unload(name) {
    if (this.models[name]) {
      if (this.models[name].type === 'mediapipe') {
        try { this.models[name].model.close(); } catch(_) {}
      }
      delete this.models[name];
      if (this.active === name) this.active = null;
    }
  }
}
