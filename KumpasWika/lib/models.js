
const { SignRecognizer } = require('./recognizer');

let cached = null;

function loadBundled() {
  let staticJson = null;
  let videoJson = null;
  try {
    staticJson = require('../assets/models/fsl_static_model.json');
  } catch (e) {}
  try {
    videoJson = require('../assets/models/fsl_video_model.json');
  } catch (e) {}
  return { staticJson, videoJson };
}

function getRecognizer() {
  if (cached) return cached;
  try {
    const { staticJson, videoJson } = loadBundled();
    if (!staticJson || !videoJson) {
      const missing = [!staticJson && 'fsl_static_model.json', !videoJson && 'fsl_video_model.json']
        .filter(Boolean)
        .join(' and ');
      cached = { error: `Missing ${missing} in assets/models/` };
    } else {
      cached = { recognizer: new SignRecognizer(staticJson, videoJson) };
    }
  } catch (e) {
    cached = { error: String(e && e.message ? e.message : e) };
  }
  return cached;
}

module.exports = { getRecognizer };
