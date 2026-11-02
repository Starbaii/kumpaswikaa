import argparse
import json
import os

import joblib
import numpy as np


def export_forest(model, decimals, max_trees):
    classes = [str(c) for c in model.classes_]
    n_classes = len(classes)
    estimators = model.estimators_[:max_trees] if max_trees else model.estimators_

    trees = []
    for est in estimators:
        t = est.tree_
        n = t.node_count
        feature = t.feature
        threshold = t.threshold
        left = t.children_left
        right = t.children_right
        value = t.value.reshape(n, -1)

        f, th, l, r = [], [], [], []
        impure = {}
        for i in range(n):
            if left[i] == -1:  # leaf
                probs = value[i] / value[i].sum()
                best = int(np.argmax(probs))
                f.append(-1)
                th.append(best)
                l.append(-1)
                r.append(-1)
                if probs[best] < 0.999999:
                    impure[str(i)] = [
                        [int(c), round(float(p), 5)]
                        for c, p in enumerate(probs)
                        if p > 0
                    ]
            else:
                f.append(int(feature[i]))
                th.append(round(float(threshold[i]), decimals))
                l.append(int(left[i]))
                r.append(int(right[i]))
        tree = {"f": f, "t": th, "l": l, "r": r}
        if impure:
            tree["p"] = impure
        trees.append(tree)

    return {
        "type": "random_forest",
        "classes": classes,
        "nClasses": n_classes,
        "nFeatures": int(model.n_features_in_),
        "trees": trees,
    }


def predict_proba_json(js, x):
    """Reference re-implementation of what the app does (used for self-check)."""
    n_classes = js["nClasses"]
    total = np.zeros(n_classes)
    for tree in js["trees"]:
        i = 0
        while tree["f"][i] != -1:
            i = tree["l"][i] if x[tree["f"][i]] <= tree["t"][i] else tree["r"][i]
        p = tree.get("p", {}).get(str(i))
        if p:
            for c, v in p:
                total[c] += v
        else:
            total[int(tree["t"][i])] += 1.0
    return total / len(js["trees"])


def process(path, name, out_dir, decimals, max_trees):
    print(f"\n=== {name}: {path}")
    model = joblib.load(path)
    if not hasattr(model, "estimators_"):
        raise SystemExit(f"{path} is not a Random Forest - this exporter only handles RandomForestClassifier.")

    js = export_forest(model, decimals, max_trees)
    print(f"classes ({js['nClasses']}): {js['classes']}")
    print(f"features: {js['nFeatures']}   trees: {len(js['trees'])}")

    rng = np.random.default_rng(0)
    n_feat = js["nFeatures"]
    X = rng.uniform(-0.6, 0.6, size=(300, n_feat))
    X[::2, n_feat // 2:] = 0.0
    sk_proba = model.predict_proba(X)
    if max_trees:
        sk_proba = np.mean([e.predict_proba(X) for e in model.estimators_[:max_trees]], axis=0)
    js_proba = np.array([predict_proba_json(js, x) for x in X])
    max_diff = float(np.abs(sk_proba - js_proba).max())
    agree = float((sk_proba.argmax(1) == js_proba.argmax(1)).mean())
    print(f"self-check: label agreement {agree * 100:.1f}%   max probability diff {max_diff:.5f}")

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{name}.json")
    with open(out_path, "w") as fh:
        json.dump(js, fh, separators=(",", ":"))
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"wrote {out_path}  ({size_mb:.2f} MB)")
    if size_mb > 25:
        print("  WARNING: large file. Re-run with --max-trees 100 to shrink it.")

    tests = {
        "classes": js["classes"],
        "cases": [
            {"x": [round(float(v), 6) for v in X[i]],
             "proba": [round(float(v), 5) for v in js_proba[i]]}
            for i in range(0, 300, 30)
        ],
    }
    with open(os.path.join(out_dir, f"{name}_tests.json"), "w") as fh:
        json.dump(tests, fh)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--static", default="fsl_static_model.pkl")
    ap.add_argument("--video", default="fsl_video_model.pkl")
    ap.add_argument("--out", default="assets/models")
    ap.add_argument("--max-trees", type=int, default=0)
    ap.add_argument("--decimals", type=int, default=6)
    a = ap.parse_args()
    process(a.static, "fsl_static_model", a.out, a.decimals, a.max_trees)
    process(a.video, "fsl_video_model", a.out, a.decimals, a.max_trees)
    print("\nDone!")
