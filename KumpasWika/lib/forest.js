
function fromFlat(js) {
  const need = ['roots', 'feat', 'thr', 'right', 'leafStart', 'leafCls', 'leafP'];
  for (const k of need) {
    if (!Array.isArray(js[k])) throw new Error(`Flat model JSON is missing "${k}".`);
  }
  const n = js.feat.length;
  if (js.thr.length !== n || js.right.length !== n) {
    throw new Error('Flat model JSON arrays have different lengths.');
  }
  const make = (Type, arr) => {
    const t = new Type(arr.length);
    t.set(arr);
    return t;
  };
  return {
    feat: make(Int32Array, js.feat),
    thr: make(Float64Array, js.thr),
    right: make(Int32Array, js.right),
    roots: make(Int32Array, js.roots),
    leafStart: make(Int32Array, js.leafStart),
    leafCls: make(Int16Array, js.leafCls),
    leafP: make(Float64Array, js.leafP),
  };
}

function fromLegacy(js) {
  const trees = js.trees;
  const nTrees = trees.length;

  let nNodes = 0;
  let nImpure = 0;
  let nEntries = 0;
  for (let k = 0; k < nTrees; k++) {
    nNodes += trees[k].f.length;
    const p = trees[k].p;
    if (p) {
      for (const key in p) {
        nImpure++;
        nEntries += p[key].length;
      }
    }
  }

  const feat = new Int32Array(nNodes);
  const thr = new Float64Array(nNodes);
  const right = new Int32Array(nNodes);
  const roots = new Int32Array(nTrees);
  const leafStart = new Int32Array(nImpure + 1);
  const leafCls = new Int16Array(nEntries);
  const leafP = new Float64Array(nEntries);

  let base = 0;
  let impureId = 0;
  let entry = 0;
  for (let k = 0; k < nTrees; k++) {
    const tr = trees[k];
    const n = tr.f.length;
    for (let i = 0; i < n; i++) {
      if (tr.l[i] !== -1 && tr.l[i] !== i + 1) {
        throw new Error('Model JSON is not stored depth-first (left child must be i + 1).');
      }
    }
    roots[k] = base;
    feat.set(tr.f, base);
    thr.set(tr.t, base);
    for (let i = 0; i < n; i++) right[base + i] = tr.r[i] < 0 ? -1 : base + tr.r[i];
    const p = tr.p;
    if (p) {
      for (const key in p) {
        const probs = p[key];
        feat[base + +key] = -(2 + impureId);
        leafStart[impureId] = entry;
        for (let j = 0; j < probs.length; j++) {
          leafCls[entry] = probs[j][0];
          leafP[entry] = probs[j][1];
          entry++;
        }
        impureId++;
      }
    }
    base += n;
  }
  leafStart[impureId] = entry;
  return { feat, thr, right, roots, leafStart, leafCls, leafP };
}

function loadForest(js) {
  if (!js || js.type !== 'random_forest' || !(Array.isArray(js.trees) || js.format === 'flat')) {
    throw new Error('Model JSON is not an exported random_forest.');
  }
  const arrays = js.format === 'flat' ? fromFlat(js) : fromLegacy(js);
  return {
    classes: js.classes,
    nClasses: js.nClasses,
    nFeatures: js.nFeatures,
    featureVersion: js.featureVersion || (js.nFeatures === 2600 ? 2 : 1),
    nTrees: arrays.roots.length,
    ...arrays,
  };
}

function predictProba(forest, x, out) {
  const total = out || new Float64Array(forest.nClasses);
  total.fill(0);
  const { feat, thr, right, roots, leafStart, leafCls, leafP, nTrees } = forest;
  for (let k = 0; k < nTrees; k++) {
    let i = roots[k];
    let f = feat[i];
    while (f >= 0) {
      i = x[f] <= thr[i] ? i + 1 : right[i];
      f = feat[i];
    }
    if (f === -1) {
      total[thr[i]] += 1;
    } else {
      const id = -2 - f;
      for (let j = leafStart[id], e = leafStart[id + 1]; j < e; j++) total[leafCls[j]] += leafP[j];
    }
  }
  for (let c = 0; c < total.length; c++) total[c] /= nTrees;
  return total;
}

function predict(forest, x, scratch) {
  const proba = predictProba(forest, x, scratch);
  let best = 0;
  for (let c = 1; c < proba.length; c++) if (proba[c] > proba[best]) best = c;
  return { label: forest.classes[best], confidence: proba[best] };
}

module.exports = { loadForest, predictProba, predict };
