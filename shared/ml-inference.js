/**
 * Grist AppStore — ML Inference Loop
 * Boucle de détection/classification continue + overlay canvas
 */

class MLInference {
  constructor(modelManager) {
    this.mm       = modelManager;
    this.running  = false;
    this.onResult = null;
    this.fpsArr   = [];
    this.lastMs   = 0;
    this._classes = [];
  }

  setClasses(classes) { this._classes = classes; }

  async startLoop(videoEl, canvasEl, onResult) {
    this.running  = true;
    this.onResult = onResult;
    const ctx = canvasEl.getContext('2d');

    while (this.running) {
      if (videoEl.readyState < 2) { await this._yieldFrame(); continue; }

      canvasEl.width  = videoEl.videoWidth  || videoEl.clientWidth;
      canvasEl.height = videoEl.videoHeight || videoEl.clientHeight;

      const t0 = performance.now();
      let results = null;

      try {
        const active = this.mm.getActive();
        if (!active) { await this._yieldFrame(); continue; }

        if (active.type === 'mediapipe') {
          const raw = active.model.detectForVideo(videoEl, t0);
          results = this._normalizeMediaPipe(raw);
        } else if (active.type === 'tfjs' || active.type === 'tfjs-local') {
          results = await this._runTFJS(active.model, videoEl);
        }
      } catch(e) {
        await this._yieldFrame();
        continue;
      }

      this.lastMs = Math.round(performance.now() - t0);
      this._updateFPS();

      if (results && results.length) {
        this.drawOverlay(ctx, canvasEl.width, canvasEl.height, results);
        if (this.onResult) this.onResult(results, this.getStats());
      } else {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      }

      await this._yieldFrame();
    }
  }

  stopLoop() {
    this.running = false;
  }

  async runOnce(videoEl) {
    const active = this.mm.getActive();
    if (!active) return [];
    if (active.type === 'mediapipe') {
      return this._normalizeMediaPipe(active.model.detectForVideo(videoEl, performance.now()));
    }
    return this._runTFJS(active.model, videoEl);
  }

  _normalizeMediaPipe(raw) {
    if (!raw || !raw.detections) return [];
    return raw.detections.map(d => ({
      class: d.categories[0]?.categoryName || 'unknown',
      score: d.categories[0]?.score || 0,
      bbox:  d.boundingBox ? [d.boundingBox.originX, d.boundingBox.originY, d.boundingBox.width, d.boundingBox.height] : [0,0,0,0],
    }));
  }

  async _runTFJS(model, videoEl) {
    const img = tf.browser.fromPixels(videoEl).resizeBilinear([224, 224]).div(127.5).sub(1).expandDims(0);
    const pred = model.predict(img);
    const data = await pred.data();
    img.dispose(); pred.dispose();

    const classIdx = data.indexOf(Math.max(...data));
    const conf = data[classIdx];
    const label = this._classes[classIdx] || `class_${classIdx}`;
    return [{ class: label, score: conf, bbox: null }];
  }

  drawOverlay(ctx, W, H, results) {
    ctx.clearRect(0, 0, W, H);

    results.forEach(r => {
      if (!r.bbox) return;
      const [x, y, w, h] = r.bbox;
      const color = this._getColor(r.class);
      const conf = Math.round(r.score * 100);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, h);

      const fontSize = Math.max(12, Math.min(16, w / 8));
      ctx.font = `bold ${fontSize}px 'Segoe UI',sans-serif`;
      const text = `${r.class} ${conf}%`;
      const tw = ctx.measureText(text).width + 10;
      const th = fontSize + 6;
      const ly = y > th + 2 ? y - th : y;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, ly, tw, th, [3]);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + 5, ly + fontSize);
    });
  }

  _getColor(className) {
    const colors = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#ff7b72','#79c0ff','#7ee787'];
    let hash = 0;
    for (let i = 0; i < className.length; i++) hash = className.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  _updateFPS() {
    const now = Date.now();
    this.fpsArr.push(now);
    this.fpsArr = this.fpsArr.filter(t => now - t < 1000);
  }

  getStats() {
    return { fps: this.fpsArr.length, inferenceMs: this.lastMs };
  }

  _yieldFrame() { return new Promise(r => requestAnimationFrame(r)); }
}
