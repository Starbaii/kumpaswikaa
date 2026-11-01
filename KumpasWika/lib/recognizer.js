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
    this.altFeatures = new Float32Array(cfg.FEATURES_PER_FRAME);
    this.reset();
  }

  reset() {
    this.buffer = []; 
    this.times = []; 
    this.recent = [];
    this.lastCommitted = null;
    this.noHandFrames = 0;
    this.frameNo = 0;
    this.lastVideo = null;
  }

  _clearWindow() {
    this.buffer.length = 0;
    this.times.length = 0;
    this.lastVideo = null;
  }

  _videoPrediction(now) {
    const { buffer, times } = this;
    let drop = 0;
    while (drop < times.length && now - times[drop] > cfg.VIDEO_WINDOW_MS) drop++;
    if (drop > 0) {
      buffer.splice(0, drop);
      times.splice(0, drop);
    }
    while (buffer.length > cfg.VIDEO_MAX_BUFFER) {
      buffer.shift();
      times.shift();
    }

    const n = buffer.length;
    if (n < cfg.VIDEO_MIN_FRAMES || times[n - 1] - times[0] < cfg.VIDEO_MIN_SPAN_MS) return null;

    const L = cfg.SEQUENCE_LENGTH;
    for (let k = 0; k < L; k++) {
      const idx = Math.floor((k * (n - 1)) / (L - 1)); 
      this.videoInput.set(buffer[idx], k * cfg.FEATURES_PER_FRAME);
    }
    return predict(this.videoForest, this.videoInput, this.videoScratch);
  }

  process(result, now) {
    now = now || Date.now();
    const hands = result && result.hands ? result.hands : [];
    const features = extractTwoHandFeatures(hands, result && result.handedness, cfg.MIRROR_INPUT);

    if (features === null) {
      this.noHandFrames++;
      this.recent.push(null);
      if (this.recent.length > cfg.STABLE_WINDOW) this.recent.shift();
      // Only reset after the hands are really gone, not on one dropped detection.
      if (this.noHandFrames >= cfg.NO_HAND_RESET_FRAMES) {
        this._clearWindow();
        this.recent.length = 0;
        this.lastCommitted = null;
      }
      return {
        handCount: 0,
        bufferFill: Math.min(this.buffer.length, cfg.SEQUENCE_LENGTH),
        static: null,
        video: null,
        candidate: null,
        committed: null,
      };
    }
    this.noHandFrames = 0;
    this.frameNo++;

    let s = predict(this.staticForest, features, this.staticScratch);
    if (cfg.TRY_BOTH_SLOTS_FOR_ONE_HAND && hands.length === 1) {
      const alt = this.altFeatures;
      alt.set(features.subarray(cfg.FEATURES_PER_HAND), 0);
      alt.set(features.subarray(0, cfg.FEATURES_PER_HAND), cfg.FEATURES_PER_HAND);
      const s2 = predict(this.staticForest, alt, this.staticScratch);
      if (s2.confidence > s.confidence) s = s2;
    }

    this.buffer.push(features);
    this.times.push(now);

    if (this.frameNo % cfg.VIDEO_STRIDE === 0 || this.lastVideo === null) {
      this.lastVideo = this._videoPrediction(now);
    }
    const v = this.lastVideo;

    const sOk = s.confidence >= cfg.STATIC_MIN_CONF;
    const vOk = v !== null && v.confidence >= cfg.VIDEO_MIN_CONF;
    let candidate = null;
    if (vOk && (!sOk || v.confidence >= s.confidence)) {
      candidate = { label: v.label, confidence: v.confidence, source: 'video' };
    } else if (sOk) {
      candidate = { label: s.label, confidence: s.confidence, source: 'static' };
    }

    this.recent.push(candidate ? candidate.label : null);
    if (this.recent.length > cfg.STABLE_WINDOW) this.recent.shift();

    let committed = null;
    if (candidate && candidate.label !== this.lastCommitted) {
      let votes = 0;
      for (let i = 0; i < this.recent.length; i++) if (this.recent[i] === candidate.label) votes++;
      if (votes >= cfg.STABLE_VOTES) {
        committed = candidate.label;
        this.lastCommitted = committed;
        if (candidate.source === 'video') this._clearWindow(); 
      }
    }

    return {
      handCount: hands.length,
      bufferFill: Math.min(this.buffer.length, cfg.SEQUENCE_LENGTH),
      static: s,
      video: v,
      candidate,
      committed,
    };
  }
}

module.exports = { SignRecognizer };
