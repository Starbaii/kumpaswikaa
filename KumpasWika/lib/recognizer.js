
const cfg = require('./config');
const { loadForest, predict } = require('./forest');
const { extractTwoHandFeatures } = require('./features');

class SignRecognizer {
  constructor(staticJson, videoJson) {
    this.staticForest = loadForest(staticJson);
    this.videoForest = loadForest(videoJson);

    if (this.staticForest.nFeatures !== cfg.FEATURES_PER_FRAME) {
      throw new Error(
        `Static model expects ${this.staticForest.nFeatures} features, app builds ${cfg.FEATURES_PER_FRAME}.`
      );
    }
    if (this.videoForest.nFeatures !== cfg.FEATURES_PER_VIDEO) {
      throw new Error(
        `Video model expects ${this.videoForest.nFeatures} features, app builds ${cfg.FEATURES_PER_VIDEO}.`
      );
    }

    this.staticScratch = new Float64Array(this.staticForest.nClasses);
    this.videoScratch = new Float64Array(this.videoForest.nClasses);
    this.videoInput = new Float32Array(cfg.FEATURES_PER_VIDEO);
    this.reset();
  }

  reset() {
    this.buffer = []; 
    this.recent = []; 
    this.lastCommitted = null;
    this.noHandFrames = 0;
  }

  process(result) {
    const hands = result && result.hands ? result.hands : [];
    const features = extractTwoHandFeatures(hands, result && result.handedness, cfg.MIRROR_INPUT);

    if (features === null) {
      this.buffer.length = 0;
      this.recent.length = 0;
      this.noHandFrames++;
      if (this.noHandFrames >= cfg.NO_HAND_RESET_FRAMES) this.lastCommitted = null;
      return {
        handCount: 0,
        bufferFill: 0,
        static: null,
        video: null,
        candidate: null,
        committed: null,
      };
    }
    this.noHandFrames = 0;

    const s = predict(this.staticForest, features, this.staticScratch);

    this.buffer.push(features);
    if (this.buffer.length > cfg.SEQUENCE_LENGTH) this.buffer.shift();

    let v = null;
    if (this.buffer.length === cfg.SEQUENCE_LENGTH) {
      for (let i = 0; i < cfg.SEQUENCE_LENGTH; i++) {
        this.videoInput.set(this.buffer[i], i * cfg.FEATURES_PER_FRAME);
      }
      v = predict(this.videoForest, this.videoInput, this.videoScratch);
    }

    const sOk = s.confidence >= cfg.STATIC_MIN_CONF;
    const vOk = v !== null && v.confidence >= cfg.VIDEO_MIN_CONF;
    let candidate = null;
    if (vOk && (!sOk || v.confidence >= s.confidence)) {
      candidate = { label: v.label, confidence: v.confidence, source: 'video' };
    } else if (sOk) {
      candidate = { label: s.label, confidence: s.confidence, source: 'static' };
    }

    this.recent.push(candidate ? candidate.label : null);
    if (this.recent.length > cfg.STABLE_FRAMES) this.recent.shift();

    let committed = null;
    if (
      candidate &&
      this.recent.length === cfg.STABLE_FRAMES &&
      this.recent.every((l) => l === candidate.label) &&
      candidate.label !== this.lastCommitted
    ) {
      committed = candidate.label;
      this.lastCommitted = committed;
    }

    return {
      handCount: hands.length,
      bufferFill: this.buffer.length,
      static: s,
      video: v,
      candidate,
      committed,
    };
  }
}

module.exports = { SignRecognizer };
