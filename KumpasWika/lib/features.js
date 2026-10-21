
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

module.exports = { extractTwoHandFeatures };
