/**
 * Grist AppStore — Capteurs mobiles
 * Primitives : GPS, caméra, micro, mouvement, réseau, batterie
 * Chaque capteur suit le contrat : start() / stop() / data (getter)
 */

// ─── GPS continu (watchPosition) ───
class GPSTracker {
  constructor(opts = {}) {
    this._watchId = null;
    this.position = null;
    this.onChange  = opts.onChange || null;
    this._opts = {
      enableHighAccuracy: opts.highAccuracy !== false,
      maximumAge:         opts.maxAge   || 2000,
      timeout:            opts.timeout  || 10000,
    };
  }

  get available() { return !!navigator.geolocation; }

  start() {
    if (!this.available) return;
    this._watchId = navigator.geolocation.watchPosition(
      pos => {
        this.position = {
          lat:     pos.coords.latitude,
          lon:     pos.coords.longitude,
          acc:     Math.round(pos.coords.accuracy),
          speed:   pos.coords.speed   != null ? +(pos.coords.speed * 3.6).toFixed(1) : null,
          heading: pos.coords.heading != null ? Math.round(pos.coords.heading)        : null,
          alt:     pos.coords.altitude,
          ts:      pos.timestamp,
        };
        if (this.onChange) this.onChange(this.position);
      },
      () => { this.position = null; if (this.onChange) this.onChange(null); },
      this._opts
    );
  }

  stop() {
    if (this._watchId != null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
  }

  async oneShot() {
    return new Promise((resolve, reject) => {
      if (!this.available) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude, lon: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy),
          speed: pos.coords.speed != null ? +(pos.coords.speed * 3.6).toFixed(1) : null,
          heading: pos.coords.heading != null ? Math.round(pos.coords.heading) : null,
        }),
        () => resolve(null),
        this._opts
      );
    });
  }
}

// ─── Caméra (flux vidéo continu) ───
class CameraStream {
  constructor(opts = {}) {
    this.stream     = null;
    this.videoEl    = opts.videoEl || null;
    this.facingMode = opts.facing || 'environment';
    this.width      = opts.width  || 1280;
    this.height     = opts.height || 720;
  }

  get active() { return !!(this.stream && this.stream.active); }

  async start() {
    const constraints = {
      video: { facingMode: { ideal: this.facingMode }, width: { ideal: this.width }, height: { ideal: this.height } },
      audio: false
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (this.videoEl) {
      this.videoEl.srcObject = this.stream;
      await new Promise(r => { this.videoEl.onloadedmetadata = () => { this.videoEl.play(); r(); }; });
    }
    return this.stream;
  }

  stop() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.videoEl) this.videoEl.srcObject = null;
  }

  flip() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (this.active) { this.stop(); return this.start(); }
  }

  captureFrame(maxWidth = 320, quality = 0.7) {
    if (!this.videoEl || !this.videoEl.videoWidth) return null;
    const scale = maxWidth / this.videoEl.videoWidth;
    const c = document.createElement('canvas');
    c.width  = maxWidth;
    c.height = Math.round(this.videoEl.videoHeight * scale);
    c.getContext('2d').drawImage(this.videoEl, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }
}

// ─── Micro (enregistrement par chunks) ───
class AudioRecorder {
  constructor(opts = {}) {
    this.chunkMs   = opts.chunkMs || 10000;
    this.onChunk   = opts.onChunk || null;
    this.onStop    = opts.onStop  || null;
    this.onLevel   = opts.onLevel || null;
    this._recorder = null;
    this._stream   = null;
    this._chunks   = [];
    this._analyser = null;
    this._animId   = null;
  }

  get recording() { return this._recorder && this._recorder.state === 'recording'; }

  async start() {
    this._stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._chunks   = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                   : MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm'
                   : '';
    this._recorder = new MediaRecorder(this._stream, mimeType ? { mimeType } : {});

    this._recorder.ondataavailable = e => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };

    let chunkStart = 0;
    this._recorder.onstart = () => { chunkStart = Date.now(); };

    this._recorder.onstop = () => {
      const blob = new Blob(this._chunks, { type: this._recorder.mimeType || 'audio/webm' });
      if (this.onStop) this.onStop(blob);
      this._stopAnalyser();
    };

    this._recorder.start(200);
    this._startAnalyser();

    if (this.onChunk && this.chunkMs > 0) {
      this._chunkInterval = setInterval(() => {
        if (!this.recording) return;
        const elapsed = Date.now() - chunkStart;
        const blob = new Blob(this._chunks.slice(), { type: this._recorder.mimeType || 'audio/webm' });
        if (blob.size > 0 && this.onChunk) this.onChunk(blob, elapsed);
        chunkStart = Date.now();
        this._chunks = [];
        this._recorder.stop();
        this._recorder.start(200);
      }, this.chunkMs);
    }
  }

  stop() {
    if (this._chunkInterval) { clearInterval(this._chunkInterval); this._chunkInterval = null; }
    if (this._recorder && this.recording) this._recorder.stop();
    if (this._stream) { this._stream.getTracks().forEach(t => t.stop()); this._stream = null; }
  }

  _startAnalyser() {
    if (!this.onLevel || !this._stream) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._analyser = ctx.createAnalyser();
      this._analyser.fftSize = 256;
      ctx.createMediaStreamSource(this._stream).connect(this._analyser);
      const buf = new Uint8Array(this._analyser.frequencyBinCount);
      const tick = () => {
        if (!this._analyser) return;
        this._analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        this.onLevel(avg / 255);
        this._animId = requestAnimationFrame(tick);
      };
      tick();
    } catch(_) {}
  }

  _stopAnalyser() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    this._analyser = null;
  }
}

// ─── Connectivité réseau ───
class NetworkMonitor {
  constructor(opts = {}) {
    this.online   = navigator.onLine;
    this.onChange  = opts.onChange || null;
    this._onOn    = () => { this.online = true;  if (this.onChange) this.onChange(true);  };
    this._onOff   = () => { this.online = false; if (this.onChange) this.onChange(false); };
  }

  start() {
    window.addEventListener('online',  this._onOn);
    window.addEventListener('offline', this._onOff);
  }

  stop() {
    window.removeEventListener('online',  this._onOn);
    window.removeEventListener('offline', this._onOff);
  }
}

// ─── Mouvement / IMU (accéléromètre, gyroscope) ───
class MotionSensor {
  constructor(opts = {}) {
    this.data     = null;
    this.onChange  = opts.onChange || null;
    this._handler = e => {
      this.data = {
        accelX: e.acceleration?.x, accelY: e.acceleration?.y, accelZ: e.acceleration?.z,
        rotAlpha: e.rotationRate?.alpha, rotBeta: e.rotationRate?.beta, rotGamma: e.rotationRate?.gamma,
        interval: e.interval,
      };
      if (this.onChange) this.onChange(this.data);
    };
  }

  async start() {
    if (typeof DeviceMotionEvent?.requestPermission === 'function') {
      const perm = await DeviceMotionEvent.requestPermission();
      if (perm !== 'granted') return false;
    }
    window.addEventListener('devicemotion', this._handler);
    return true;
  }

  stop() { window.removeEventListener('devicemotion', this._handler); }
}

// ─── Orientation (boussole) ───
class OrientationSensor {
  constructor(opts = {}) {
    this.data     = null;
    this.onChange  = opts.onChange || null;
    this._handler = e => {
      this.data = { alpha: e.alpha, beta: e.beta, gamma: e.gamma, absolute: e.absolute };
      if (this.onChange) this.onChange(this.data);
    };
  }

  async start() {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') return false;
    }
    window.addEventListener('deviceorientation', this._handler);
    return true;
  }

  stop() { window.removeEventListener('deviceorientation', this._handler); }
}
