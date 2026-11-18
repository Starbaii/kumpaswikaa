
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

// Labels that are almost certainly the same sign recorded under two names.
// Used only to add probabilities together (see buildGroups). Edit as needed.
const CLASS_ALIASES = {
  "i_don't_know": "don't_know",
  "i_don't_understand": "don't_understand",
  i_understand: 'understand',
};

const canonical = (label) => {
  const s = String(label).toLowerCase().replace(/[\s-]+/g, '_');
  return CLASS_ALIASES[s] || s;
};

// Maps every class index to a group index. Classes that normalise to the same name share
// a group; a group of one keeps its original label (so single letters keep their case).
function buildGroups(classes, merge) {
  const names = classes.map((c) => (merge ? canonical(c) : String(c)));
  const order = [];
  const groupOf = new Int16Array(classes.length);
  const first = [];
  const size = [];
  for (let i = 0; i < names.length; i++) {
    let g = order.indexOf(names[i]);
    if (g < 0) {
      g = order.length;
      order.push(names[i]);
      first.push(i);
      size.push(0);
    }
    groupOf[i] = g;
    size[g]++;
  }
  const labels = order.map((n, g) => (size[g] === 1 ? String(classes[first[g]]) : n));
  return { labels, groupOf, nGroups: labels.length };
}

function loadForest(js, merge) {
  if (!js || js.type !== 'random_forest' || !(Array.isArray(js.trees) || js.format === 'flat')) {
    throw new Error('Model JSON is not an exported random_forest.');
  }
  const arrays = js.format === 'flat' ? fromFlat(js) : fromLegacy(js);
  const groups = buildGroups(js.classes, merge !== false);
  return {
    classes: js.classes,
    groups,
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
  const { groupOf, labels, nGroups } = forest.groups;
  if (nGroups === proba.length) {
    let best = 0;
    for (let c = 1; c < proba.length; c++) if (proba[c] > proba[best]) best = c;
    return { label: forest.classes[best], confidence: proba[best] };
  }
  // Some classes share a group: add their probabilities, then take the best group.
  const sums = new Float64Array(nGroups);
  for (let c = 0; c < proba.length; c++) sums[groupOf[c]] += proba[c];
  let best = 0;
  for (let g = 1; g < nGroups; g++) if (sums[g] > sums[best]) best = g;
  return { label: labels[best], confidence: sums[best] };
}

module.exports = { loadForest, predictProba, predict };
