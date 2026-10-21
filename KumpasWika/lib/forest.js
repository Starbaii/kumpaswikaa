
function loadForest(js) {
  if (!js || js.type !== 'random_forest' || !Array.isArray(js.trees)) {
    throw new Error('Model JSON is not an exported random_forest.');
  }
  return {
    classes: js.classes,
    nClasses: js.nClasses,
    nFeatures: js.nFeatures,
    trees: js.trees.map((t) => ({
      f: Int32Array.from(t.f),
      t: Float64Array.from(t.t),
      l: Int32Array.from(t.l),
      r: Int32Array.from(t.r),
      p: t.p || null, 
    })),
  };
}

function predictProba(forest, x, out) {
  const total = out || new Float64Array(forest.nClasses);
  total.fill(0);
  const trees = forest.trees;
  for (let k = 0; k < trees.length; k++) {
    const tree = trees[k];
    const f = tree.f, t = tree.t, l = tree.l, r = tree.r;
    let i = 0;
    while (f[i] !== -1) {
      i = x[f[i]] <= t[i] ? l[i] : r[i];
    }
    const p = tree.p && tree.p[i];
    if (p) {
      for (let j = 0; j < p.length; j++) total[p[j][0]] += p[j][1];
    } else {
      total[t[i]] += 1;
    }
  }
  for (let c = 0; c < total.length; c++) total[c] /= trees.length;
  return total;
}

function predict(forest, x, scratch) {
  const proba = predictProba(forest, x, scratch);
  let best = 0;
  for (let c = 1; c < proba.length; c++) if (proba[c] > proba[best]) best = c;
  return { label: forest.classes[best], confidence: proba[best] };
}

module.exports = { loadForest, predictProba, predict };
