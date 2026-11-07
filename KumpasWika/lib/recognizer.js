const cfg = require('./config');
const { loadForest, predict } = require('./forest');
const { extractTwoHandFeatures, toRecords, staticFeaturesV2, videoFeaturesV2 } = require('./features');

class SignRecognizer {
  constructor(staticJson, videoJson) {
    this.staticForest = loadForest(staticJson);
    this.videoForest = loadForest(videoJson);

    this.staticV = this.staticForest.featureVersion;
    this.videoV = this.videoForest.featureVersion;
    const wantStatic = cfg.FEATURES_PER_FRAME; // 126 in both versions
    const wantVideo = this.videoV === 2 ? cfg.FEATURES_PER_VIDEO_V2 : cfg.FEATURES_PER_VIDEO;
    if (this.staticForest.nFeatures !== wantStatic) {
      throw new Error(
        `Static model expects ${this.staticForest.nFeatures} features, app builds ${wantStatic}.`
      );
    }
    if (this.videoForest.nFeatures !== wantVideo) {
      throw new Error(
        `Video model expects ${this.videoForest.nFeatures} features (v${this.videoV}), app builds ${wantVideo}.`
      );
    }

    this.staticScratch = new Float64Array(this.staticForest.nClasses);
    this.videoScratch = new Float64Array(this.videoForest.nClasses);
    this.staticInput = new Float32Array(cfg.FEATURES_PER_FRAME);
    this.videoInput = new Float32Array(wantVideo);
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
    this.motionTrail = []; // { t, x, y, s } of the first hand; survives _clearWindow()
  }

  // How far the wrist travelled over the last MOTION_WINDOW_MS, in hand sizes.
  _motion(now, recs) {
    const trail = this.motionTrail;
    const r = recs[0];
    const size = Math.hypot(r[27] - r[0], r[28] - r[1], r[29] - r[2]);
    trail.push({ t: now, x: r[0], y: r[1], s: size > 1e-6 ? size : 1 });
    while (trail.length > 1 && now - trail[0].t > cfg.MOTION_WINDOW_MS) trail.shift();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, sum = 0;
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      sum += p.s;
    }
    return Math.hypot(maxX - minX, maxY - minY) / (sum / trail.length);
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

    if (this.videoV === 2) {
      const seq = new Array(n);
      for (let i = 0; i < n; i++) seq[i] = buffer[i].recs;
      if (!videoFeaturesV2(seq, this.videoInput)) return null;
    } else {
      const L = cfg.SEQUENCE_LENGTH;
      for (let k = 0; k < L; k++) {
        const idx = Math.floor((k * (n - 1)) / (L - 1));
        this.videoInput.set(buffer[idx].legacy, k * cfg.FEATURES_PER_FRAME);
      }
    }
    return predict(this.videoForest, this.videoInput, this.videoScratch);
  }

  process(result, now) {
    now = now || Date.now();
    const hands = result && result.hands ? result.hands : [];
    if (hands.length === 0) {
      this.noHandFrames++;
      this.recent.push(null);
      if (this.recent.length > cfg.STABLE_WINDOW) this.recent.shift();
      // Only reset after the hands are really gone, not on one dropped detection.
      if (this.noHandFrames >= cfg.NO_HAND_RESET_FRAMES) {
        this._clearWindow();
        this.motionTrail.length = 0;
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

    const recs = toRecords(hands, result.imageWidth, result.imageHeight);
    const needLegacy = this.staticV !== 2 || this.videoV !== 2;
    const features = needLegacy
      ? extractTwoHandFeatures(hands, result.handedness, cfg.MIRROR_INPUT)
      : null;

    let s;
    if (this.staticV === 2) {
      s = predict(this.staticForest, staticFeaturesV2(recs, this.staticInput), this.staticScratch);
    } else {
      s = predict(this.staticForest, features, this.staticScratch);
      if (cfg.TRY_BOTH_SLOTS_FOR_ONE_HAND && hands.length === 1) {
        const alt = this.altFeatures;
        alt.set(features.subarray(cfg.FEATURES_PER_HAND), 0);
        alt.set(features.subarray(0, cfg.FEATURES_PER_HAND), cfg.FEATURES_PER_HAND);
        const s2 = predict(this.staticForest, alt, this.staticScratch);
        if (s2.confidence > s.confidence) s = s2;
      }
    }

    this.buffer.push({ legacy: features, recs });
    this.times.push(now);
    const moving = this._motion(now, recs) >= cfg.MOTION_GATE;

    if (this.frameNo % cfg.VIDEO_STRIDE === 0 || this.lastVideo === null) {
      this.lastVideo = this._videoPrediction(now);
    }
    const v = this.lastVideo;

    const sOk = s.confidence >= cfg.STATIC_MIN_CONF && !moving;
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
      moving,
    };
  }
}

module.exports = { SignRecognizer };
