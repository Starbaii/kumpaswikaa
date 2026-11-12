import numpy as np
from fsl_features import FEATURE_VERSION


def split_per_class(labels, frac, rng):
    """Hold out ~frac of EACH class (at least 1 when the class has >= 2 items).
    Works with small datasets where sklearn's stratified split refuses to run."""
    labels = np.asarray(labels)
    train, test = [], []
    for c in sorted(set(labels)):
        idx = np.where(labels == c)[0]
        rng.shuffle(idx)
        n_test = max(1, int(round(len(idx) * frac))) if len(idx) >= 2 else 0
        n_test = min(n_test, len(idx) - 1) if len(idx) >= 2 else 0
        test.extend(idx[:n_test])
        train.extend(idx[n_test:])
    return np.array(train), np.array(test)


def tag_and_report(model, name):
    """Stores the feature version on the model (the exporter copies it into the JSON,
    the app uses it to choose the matching feature code) and prints its size."""
    model.feature_version = FEATURE_VERSION
    nodes = sum(e.tree_.node_count for e in model.estimators_)
    print(f"{name}: {len(model.estimators_)} trees, {nodes:,} nodes "
          f"(exported JSON roughly {nodes * 26 / 1e6:.1f} MB)")
    if nodes * 26 / 1e6 > 25:
        print("  -> large. Use --trees 150 and/or --leaf 3, or export with --max-trees 100.")


def print_confusions(y_true, y_pred, top=8):
    from collections import Counter
    c = Counter((t, p) for t, p in zip(y_true, y_pred) if t != p)
    if not c:
        return
    print("Most common mistakes (true -> predicted):")
    for (t, p), n in c.most_common(top):
        print(f"  {t} -> {p}: {n}")
