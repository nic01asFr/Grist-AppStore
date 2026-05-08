/**
 * Grist AppStore — ML In-Browser Trainer
 * Transfer learning MobileNet → classification custom
 * Entraîne en 2-5s sur mobile, 100% local
 */

const MOBILENET_URL = 'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_100_224/feature_vector/3/default/1';

class InBrowserTrainer {
  constructor() {
    this.featureExtractor = null;
    this.classifier       = null;
    this.classes          = [];
    this.ready            = false;
  }

  async init(onProgress) {
    onProgress?.('Chargement MobileNet…');
    this.featureExtractor = await tf.loadGraphModel(MOBILENET_URL, { fromTFHub: true });
    this.ready = true;
    onProgress?.('Prêt');
  }

  getEmbedding(imageSource) {
    let tensor;
    if (imageSource instanceof tf.Tensor) {
      tensor = imageSource.resizeBilinear([224, 224]).div(127.5).sub(1).expandDims(0);
    } else {
      tensor = tf.browser.fromPixels(imageSource).resizeBilinear([224, 224]).div(127.5).sub(1).expandDims(0);
    }
    const embedding = this.featureExtractor.predict(tensor);
    tensor.dispose();
    return embedding;
  }

  async extractEmbeddings(samples, onProgress) {
    const embeddings = [];
    const labels = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let imgEl;
      if (s.image instanceof Blob) {
        imgEl = await createImageBitmap(s.image);
      } else {
        imgEl = s.image;
      }
      const canvas = new OffscreenCanvas(224, 224);
      canvas.getContext('2d').drawImage(imgEl, 0, 0, 224, 224);
      embeddings.push(this.getEmbedding(canvas));
      labels.push(s.classIndex);
      if (onProgress && i % 10 === 0) onProgress(`Embeddings ${i+1}/${samples.length}`);
    }
    return { X: tf.concat(embeddings), labels };
  }

  async train(samples, classes, opts = {}) {
    if (!this.ready) throw new Error('Trainer not initialized — call init() first');
    this.classes = classes;
    const numClasses = classes.length;

    const onProgress = opts.onProgress || null;
    onProgress?.('Extraction des features…');

    const indexedSamples = samples.map(s => ({
      ...s,
      classIndex: classes.indexOf(s.label)
    })).filter(s => s.classIndex >= 0);

    if (indexedSamples.length < numClasses * 2) {
      throw new Error(`Pas assez de données : ${indexedSamples.length} samples pour ${numClasses} classes`);
    }

    const { X, labels } = await this.extractEmbeddings(indexedSamples, onProgress);
    const Y = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

    onProgress?.('Construction du modèle…');
    this.classifier = tf.sequential();
    this.classifier.add(tf.layers.dense({
      units: Math.min(128, numClasses * 16),
      activation: 'relu',
      inputShape: [1280]
    }));
    this.classifier.add(tf.layers.dropout({ rate: 0.2 }));
    this.classifier.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

    this.classifier.compile({
      optimizer: tf.train.adam(opts.learningRate || 0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    onProgress?.('Entraînement…');
    const history = await this.classifier.fit(X, Y, {
      epochs: opts.epochs || 20,
      batchSize: opts.batchSize || 16,
      shuffle: true,
      validationSplit: opts.validationSplit || 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          onProgress?.(`Epoch ${epoch + 1} — acc: ${(logs.acc * 100).toFixed(1)}% val: ${(logs.val_acc * 100).toFixed(1)}%`);
        }
      }
    });

    X.dispose(); Y.dispose();

    const lastEpoch = history.history;
    return {
      accuracy: lastEpoch.acc[lastEpoch.acc.length - 1],
      valAccuracy: lastEpoch.val_acc[lastEpoch.val_acc.length - 1],
      epochs: opts.epochs || 20,
      samples: indexedSamples.length,
      classes: classes,
    };
  }

  predict(imageSource) {
    if (!this.classifier || !this.featureExtractor) return null;
    const embedding = this.getEmbedding(imageSource);
    const pred = this.classifier.predict(embedding);
    const data = pred.dataSync();
    embedding.dispose(); pred.dispose();

    const classIndex = data.indexOf(Math.max(...data));
    return {
      label: this.classes[classIndex] || `class_${classIndex}`,
      classIndex,
      confidence: data[classIndex],
      allScores: Object.fromEntries(this.classes.map((c, i) => [c, data[i]])),
    };
  }

  async predictFromBlob(blob) {
    const img = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(224, 224);
    canvas.getContext('2d').drawImage(img, 0, 0, 224, 224);
    return this.predict(canvas);
  }

  async save(name = 'custom-classifier-v1') {
    if (!this.classifier) return;
    await this.classifier.save(`indexeddb://${name}`);
    localStorage.setItem(`ml-classes-${name}`, JSON.stringify(this.classes));
  }

  async load(name = 'custom-classifier-v1') {
    this.classifier = await tf.loadLayersModel(`indexeddb://${name}`);
    const stored = localStorage.getItem(`ml-classes-${name}`);
    if (stored) this.classes = JSON.parse(stored);
  }

  getModelInfo() {
    if (!this.classifier) return null;
    return {
      classes: this.classes,
      numClasses: this.classes.length,
      params: this.classifier.countParams(),
      layers: this.classifier.layers.length,
    };
  }

  dispose() {
    if (this.classifier) { this.classifier.dispose(); this.classifier = null; }
  }
}
