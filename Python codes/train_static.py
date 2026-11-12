"""
Step 2a.  python train_static_v2.py      (run extract_landmarks.py first)

Static (single image / held pose) model.  Same Random Forest as before, but with
feature version 2 and augmentation (mirror, small 3D rotations, landmark jitter).
The held-out images are never augmented, so the accuracy printed is honest.
"""
import argparse
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

import fsl_features as F
from fsl_train_utils import split_per_class, tag_and_report, print_confusions

ap = argparse.ArgumentParser()
ap.add_argument("--cache", default="cache_static.pkl")
ap.add_argument("--out", default="fsl_static_model.pkl")
ap.add_argument("--aug", type=int, default=6, help="training copies per image (1 = no augmentation)")
ap.add_argument("--trees", type=int, default=200)
ap.add_argument("--leaf", type=int, default=2, help="min_samples_leaf (bigger = smaller, smoother model)")
ap.add_argument("--test", type=float, default=0.2)
ap.add_argument("--seed", type=int, default=42)
ap.add_argument("--no-final-fit", action="store_true", help="ship the model trained WITHOUT the held-out images")
a = ap.parse_args()

rng = np.random.default_rng(a.seed)
items = [v for v in joblib.load(a.cache)["items"].values() if v["hands"]]
if not items:
    raise SystemExit("No images with a detected hand in the cache.")
labels = np.array([v["label"] for v in items])
classes, counts = np.unique(labels, return_counts=True)
print("Images with a hand:", len(items), "| classes:", len(classes))
for c, n in zip(classes, counts):
    print(f"  {c}: {n}")
if len(classes) < 2 or counts.min() < 2:
    raise SystemExit("Need >= 2 classes and >= 2 usable images per class.")

recs = [F.to_records(v["hands"], v["w"], v["h"]) for v in items]


def build(indices, aug):
    X, y = [], []
    for i in indices:
        X.append(F.static_features(recs[i])); y.append(labels[i])
        for k in range(1, aug):
            T = F.random_transform(rng, mirror=(True if k == 1 else None))
            X.append(F.static_features(F.apply_transform(recs[i], T, rng))); y.append(labels[i])
    return np.array(X, dtype=np.float32), np.array(y)


def make_model():
    return RandomForestClassifier(n_estimators=a.trees, min_samples_leaf=a.leaf, class_weight="balanced_subsample",
                                  random_state=a.seed, n_jobs=-1)


tr, te = split_per_class(labels, a.test, rng)
Xtr, ytr = build(tr, a.aug)
Xte, yte = build(te, 1)
mirror_T = {"R": np.diag([-1.0, 1.0, 1.0]), "noise": 0.0}
Xte_m = np.array([F.static_features(F.apply_transform(recs[i], mirror_T, rng)) for i in te], dtype=np.float32)
print(f"\ntrain {len(tr)} images -> {len(Xtr)} samples | held-out {len(te)} images")

model = make_model().fit(Xtr, ytr)
pred = model.predict(Xte)
print("\n==== held-out accuracy ====")
print(f"normal : {accuracy_score(yte, pred) * 100:.2f}%")
print(f"mirrored: {accuracy_score(yte, model.predict(Xte_m)) * 100:.2f}%   (should be close to 'normal')")
print(classification_report(yte, pred, zero_division=0))
print_confusions(yte, pred)

if not a.no_final_fit:
    Xall, yall = build(np.arange(len(items)), a.aug)
    model = make_model().fit(Xall, yall)
    print("\nFinal model trained on ALL images.")
tag_and_report(model, "static")
joblib.dump(model, a.out)
print("saved", a.out)
