const fs = require('fs');
const path = require('path');
const { loadForest, predictProba } = require('../lib/forest');

const dir = path.join(__dirname, '..', 'assets', 'models');
let failed = false;
for (const name of ['fsl_static_model', 'fsl_video_model']) {
  const modelPath = path.join(dir, `${name}.json`);
  const testPath = path.join(dir, `${name}_tests.json`);
  if (!fs.existsSync(modelPath) || !fs.existsSync(testPath)) {
    console.log(`${name}: skipped (need ${name}.json and ${name}_tests.json)`);
    continue;
  }
  const forest = loadForest(JSON.parse(fs.readFileSync(modelPath, 'utf8')));
  const tests = JSON.parse(fs.readFileSync(testPath, 'utf8'));
  let worst = 0;
  let labelMatches = 0;
  for (const c of tests.cases) {
    const p = predictProba(forest, c.x);
    let a = 0, b = 0;
    for (let i = 0; i < p.length; i++) {
      worst = Math.max(worst, Math.abs(p[i] - c.proba[i]));
      if (p[i] > p[a]) a = i;
      if (c.proba[i] > c.proba[b]) b = i;
    }
    if (a === b) labelMatches++;
  }
  const ok = worst < 1e-4 && labelMatches === tests.cases.length;
  if (!ok) failed = true;
  console.log(
    `${name}: ${ok ? 'OK' : 'MISMATCH'}  labels ${labelMatches}/${tests.cases.length}  max prob diff ${worst.toExponential(2)}`
  );
}
process.exit(failed ? 1 : 0);
