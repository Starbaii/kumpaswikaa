"""
Step 2b.  python train_video_v2.py      (run extract_landmarks.py first)

Video (phrase) model.  Feature version 2 adds hand MOVEMENT, uses every frame of each
clip (not 20 pre-picked ones) and is trained on many randomly cropped / mirrored /
jittered versions of each clip.  Held-out clips are never augmented.
"""
import argparse
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

import fsl_features as F
from fsl_train_utils import split_per_class, tag_and_report, print_confusions

ap = argparse.ArgumentParser()
ap.add_argument("--cache", default="cache_video.pkl")
ap.add_argument("--out", default="fsl_video_model.pkl")
ap.add_argument("--aug", type=int, default=10, help="training samples per clip (1 = none)")
ap.add_argument("--trees", type=int, default=200)
ap.add_argument("--leaf", type=int, default=2)
ap.add_argument("--window-sec", type=float, default=1.5, help="must match VIDEO_WINDOW_MS in lib/config.js")
ap.add_argument("--test", type=float, default=0.2)
ap.add_argument("--seed", type=int, default=42)
ap.add_argument("--no-final-fit", action="store_true")
a = ap.parse_args()

rng = np.random.default_rng(a.seed)
clips, labels = [], []
for k, v in joblib.load(a.cache)["items"].items():
    if len(v["frames"]) >= 3:
        clips.append([(f["t"], F.to_records(f["hands"], v["w"], v["h"])) for f in v["frames"]])
        labels.append(v["label"])
    else:
        print("skipping (too few frames with hands):", k)
labels = np.array(labels)
classes, counts = np.unique(labels, return_counts=True)
print("Usable clips:", len(clips), "| classes:", len(classes))
for c, n in zip(classes, counts):
    print(f"  {c}: {n}")
if len(classes) < 2 or counts.min() < 2:
    raise SystemExit("Need >= 2 classes and >= 2 usable clips per class.")

IDENT = {"R": np.eye(3), "noise": 0.0}
MIRROR = {"R": np.diag([-1.0, 1.0, 1.0]), "noise": 0.0}


def sample(clip, T, augment):
    sel = clip
    if augment:
        n = len(clip)
        if rng.random() < 0.6 and clip[-1][0] - clip[0][0] > a.window_sec + 0.1:
            s = rng.uniform(clip[0][0], clip[-1][0] - a.window_sec)
            sel = [c for c in clip if s <= c[0] <= s + a.window_sec]
        else:
            lo = int(rng.uniform(0, 0.15) * n)
            hi = n - int(rng.uniform(0, 0.15) * n)
            sel = clip[lo:hi]
        keep = rng.random(len(sel)) > rng.uniform(0, 0.15)      # dropped frames
        sel = [c for c, k in zip(sel, keep) if k]
        if len(sel) < 3:
            sel = clip
    return F.video_features([F.apply_transform(r, T, rng) for _, r in sel])


def build(indices, aug):
    X, y = [], []
    for i in indices:
        X.append(sample(clips[i], IDENT, False)); y.append(labels[i])
        for k in range(1, aug):
            X.append(sample(clips[i], F.random_transform(rng, mirror=(True if k == 1 else None)), True)); y.append(labels[i])
    return np.array(X, dtype=np.float32), np.array(y)


def make_model():
    return RandomForestClassifier(n_estimators=a.trees, min_samples_leaf=a.leaf, class_weight="balanced_subsample",
                                  random_state=a.seed, n_jobs=-1)


tr, te = split_per_class(labels, a.test, rng)
Xtr, ytr = build(tr, a.aug)
Xte, yte = build(te, 1)
Xte_m = np.array([sample(clips[i], MIRROR, False) for i in te], dtype=np.float32)
print(f"\ntrain {len(tr)} clips -> {len(Xtr)} samples | held-out {len(te)} clips")

model = make_model().fit(Xtr, ytr)
pred = model.predict(Xte)
print("\n==== held-out accuracy ====")
print(f"normal : {accuracy_score(yte, pred) * 100:.2f}%")
print(f"mirrored: {accuracy_score(yte, model.predict(Xte_m)) * 100:.2f}%   (should be close to 'normal')")
print(classification_report(yte, pred, zero_division=0))
print_confusions(yte, pred)

if not a.no_final_fit:
    Xall, yall = build(np.arange(len(clips)), a.aug)
    model = make_model().fit(Xall, yall)
    print("\nFinal model trained on ALL clips.")
tag_and_report(model, "video")
joblib.dump(model, a.out)
print("saved", a.out)
