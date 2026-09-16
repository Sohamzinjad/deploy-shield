"""
threshold_sweep.py
==================
Sweep the confidence threshold from 0.30 to 0.95 and report the
detection rate (recall on attack classes) vs. false-positive rate
(FPR on benign class) at each operating point.

Run:
    python ml-service/threshold_sweep.py

Outputs:
    - Terminal table of threshold vs. metrics
    - docs/threshold_curve.png  (saved for the report)
    - docs/threshold_chosen.txt (the chosen threshold value)
"""
import os
import sys
import json
import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from features import extract_features_dict, FEATURE_COLUMNS

DATA_PATH  = os.path.join(SCRIPT_DIR, 'data', 'dataset.csv')
MODEL_PATH = os.path.join(SCRIPT_DIR, 'models', 'baseline.pkl')
DOCS_DIR   = os.path.join(SCRIPT_DIR, '..', 'docs')

# ── Load model ────────────────────────────────────────────────────────────────
bundle = joblib.load(MODEL_PATH)
clf    = bundle['model']

# ── Load & split dataset (same seed as train.py) ─────────────────────────────
df = pd.read_csv(DATA_PATH)
df.fillna({'method': 'GET', 'url': '', 'headers': '{}', 'body': '', 'label': 'benign'}, inplace=True)
df = df.drop_duplicates(subset=['method', 'url', 'headers', 'body', 'label'])

feats = pd.DataFrame([
    extract_features_dict(r['method'], r['url'], r['headers'], r['body'])
    for _, r in df.iterrows()
])[FEATURE_COLUMNS]

_, X_test, _, y_test = train_test_split(
    feats, df['label'].astype(str), test_size=0.20, random_state=42, stratify=df['label']
)

proba = clf.predict_proba(X_test)   # (n_samples, n_classes)
classes = np.array(clf.classes_)
benign_idx = np.where(classes == 'benign')[0][0]

y_test_arr = y_test.values

# ── Sweep ─────────────────────────────────────────────────────────────────────
thresholds = np.arange(0.30, 0.96, 0.05)
rows = []

for t in thresholds:
    # Predict: top class if its prob >= threshold, else 'benign'
    top_idx  = np.argmax(proba, axis=1)
    top_prob = proba[np.arange(len(proba)), top_idx]
    y_pred = np.where(top_prob >= t, classes[top_idx], 'benign')

    is_benign_true = (y_test_arr == 'benign')
    is_attack_true = ~is_benign_true

    # FPR: benign flagged as attack / total benign
    fp = ((y_pred != 'benign') & is_benign_true).sum()
    tn = (is_benign_true).sum()
    fpr = fp / max(tn, 1)

    # Detection rate: attacks correctly flagged / total attacks
    tp = ((y_pred != 'benign') & is_attack_true).sum()
    fn = ((y_pred == 'benign') & is_attack_true).sum()
    dr = tp / max(tp + fn, 1)

    rows.append({'threshold': round(t, 2), 'detection_rate': round(dr, 4), 'fpr': round(fpr, 4)})

df_sweep = pd.DataFrame(rows)
print("\n=== Threshold Sweep ===")
print(df_sweep.to_string(index=False))

# ── Pick operating point: max detection_rate subject to FPR <= 5% ────────────
candidates = df_sweep[df_sweep['fpr'] <= 0.05]
if candidates.empty:
    chosen = df_sweep.loc[df_sweep['detection_rate'].idxmax()]
    print("\n[NOTE] No threshold achieves FPR ≤ 5%. Picking highest detection rate.")
else:
    chosen = candidates.loc[candidates['detection_rate'].idxmax()]

chosen_t = float(chosen['threshold'])
print(f"\nChosen threshold: {chosen_t}  (detection_rate={chosen['detection_rate']}, fpr={chosen['fpr']})")

# ── Save chosen threshold ─────────────────────────────────────────────────────
os.makedirs(DOCS_DIR, exist_ok=True)
with open(os.path.join(DOCS_DIR, 'threshold_chosen.txt'), 'w') as f:
    f.write(str(chosen_t) + '\n')
print(f"Saved chosen threshold to docs/threshold_chosen.txt")

# ── Save plot (optional — skip gracefully if matplotlib not available) ────────
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(df_sweep['threshold'], df_sweep['detection_rate'], 'b-o', label='Detection Rate')
    ax.plot(df_sweep['threshold'], df_sweep['fpr'], 'r--s', label='False Positive Rate')
    ax.axvline(chosen_t, color='green', linestyle=':', linewidth=1.5, label=f'Chosen: {chosen_t}')
    ax.set_xlabel('Confidence Threshold')
    ax.set_ylabel('Rate')
    ax.set_title('DeployShield — Threshold Calibration Curve')
    ax.legend()
    ax.grid(True, alpha=0.3)
    plot_path = os.path.join(DOCS_DIR, 'threshold_curve.png')
    fig.savefig(plot_path, dpi=150, bbox_inches='tight')
    print(f"Saved plot to {plot_path}")
except ImportError:
    print("[INFO] matplotlib not installed — skipping plot. Install it with: pip install matplotlib")
