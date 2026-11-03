const { FEATURES_PER_HAND, FEATURES_PER_FRAME } = require('./config');

function writeHand(hand, mirror, out, offset) {
  const wrist = hand[0];
  const sx = mirror ? -1 : 1;
  for (let i = 0; i < 21; i++) {
    const lm = hand[i];
    const o = offset + i * 3;
    out[o] = sx * (lm.x - wrist.x);
    out[o + 1] = lm.y - wrist.y;
    out[o + 2] = lm.z - wrist.z;
  }
}

function extractTwoHandFeatures(hands, handedness, mirror) {
  if (!hands || hands.length === 0) return null;

  let left = null;
  let right = null;

  if (handedness) {
    for (let i = 0; i < handedness.length; i++) {
      if (i >= hands.length) continue;
      const list = handedness[i];
      if (!list || list.length === 0) continue;
      let name = list[0].categoryName;
      if (mirror) name = name === 'Left' ? 'Right' : name === 'Right' ? 'Left' : name;
      if (name === 'Left') left = hands[i];
      else if (name === 'Right') right = hands[i];
    }
  }

  if (left === null && right === null) {
    if (hands.length >= 1) left = hands[0];
    if (hands.length >= 2) right = hands[1];
  }

  const out = new Float32Array(FEATURES_PER_FRAME);
  if (left) writeHand(left, mirror, out, 0);
  if (right) writeHand(right, mirror, out, FEATURES_PER_HAND);
  return out;
}

function toRecords(hands, width, height) {
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  const recs = [];
  for (let k = 0; k < hands.length; k++) {
    const hand = hands[k];
    const r = new Float64Array(63);
    for (let i = 0; i < 21; i++) {
      r[i * 3] = hand[i].x * w;
      r[i * 3 + 1] = hand[i].y * h;
      r[i * 3 + 2] = hand[i].z * w;
    }
    recs.push(r);
  }
  recs.sort((a, b) => a[0] - b[0]);
  return recs.slice(0, 2);
}

function handScale(r) {
  const s = Math.hypot(r[27] - r[0], r[28] - r[1], r[29] - r[2]);
  return s > 1e-6 ? s : 1;
}

function writeShape(r, out, offset) {
  const s = handScale(r);
  const wx = r[0], wy = r[1], wz = r[2];
  for (let i = 0; i < 21; i++) {
    out[offset + i * 3] = (r[i * 3] - wx) / s;
    out[offset + i * 3 + 1] = (r[i * 3 + 1] - wy) / s;
    out[offset + i * 3 + 2] = (r[i * 3 + 2] - wz) / s;
  }
}

function staticFeaturesV2(recs, out) {
  out.fill(0);
  for (let i = 0; i < recs.length && i < 2; i++) writeShape(recs[i], out, i * 63);
  return out;
}

function videoFeaturesV2(seq, out) {
  const L = 20;
  const n = seq.length;
  if (n === 0) return false;
  const chosen = new Array(L);
  for (let k = 0; k < L; k++) chosen[k] = seq[Math.floor((k * (n - 1)) / (L - 1))];

  let sx = 0, sy = 0, ss = 0, count = 0;
  for (let k = 0; k < L; k++) {
    for (const r of chosen[k]) {
      sx += r[0];
      sy += r[1];
      ss += handScale(r);
      count++;
    }
  }
  if (count === 0) return false;
  const refX = sx / count, refY = sy / count, gscale = ss / count;

  out.fill(0);
  const FR = 130;
  for (let k = 0; k < L; k++) {
    const recs = chosen[k];
    for (let i = 0; i < recs.length && i < 2; i++) {
      writeShape(recs[i], out, k * FR + i * 63);
      out[k * FR + 126 + 2 * i] = (recs[i][0] - refX) / gscale;
      out[k * FR + 126 + 2 * i + 1] = (recs[i][1] - refY) / gscale;
    }
  }
  return true;
}

module.exports = {
  extractTwoHandFeatures,
  toRecords,
  staticFeaturesV2,
  videoFeaturesV2
};
