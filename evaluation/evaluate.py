"""
evaluate.py
===========
Run the trained DeployShield model against the independently-collected
eval_dataset.csv and print a full classification report + confusion matrix.
This dataset must NOT have been used during training.

Usage:
    python evaluation/evaluate.py [--dataset evaluation/eval_dataset.csv]
"""
import argparse
import os
import sys
import pandas as pd
import joblib
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ML_DIR = os.path.join(SCRIPT_DIR, '..', 'ml-service')
sys.path.insert(0, ML_DIR)

from features import extract_features_dict, FEATURE_COLUMNS

MODEL_PATH = os.path.join(ML_DIR, 'models', 'baseline.pkl')


def load_threshold() -> float:
    t_file = os.path.join(SCRIPT_DIR, '..', 'docs', 'threshold_chosen.txt')
    if os.path.exists(t_file):
        with open(t_file) as f:
            return float(f.read().strip())
    return 0.5


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', default=os.path.join(SCRIPT_DIR, 'eval_dataset.csv'))
    args = parser.parse_args()

    if not os.path.exists(args.dataset):
        print(f"[ERROR] Dataset not found: {args.dataset}")
        print("Run evaluation/collect_traffic.py first.")
        sys.exit(1)

    print(f"Loading evaluation dataset: {args.dataset}")
    df = pd.read_csv(args.dataset)
    df.fillna({'method': 'GET', 'url': '', 'headers': '{}', 'body': '', 'label': 'benign'}, inplace=True)
    print(f"Rows: {len(df)}")
    print("Label distribution:\n", df['label'].value_counts(), "\n")

    bundle = joblib.load(MODEL_PATH)
    clf = bundle['model']
    threshold = load_threshold()
    print(f"Confidence threshold: {threshold}")

    feats = pd.DataFrame([
        extract_features_dict(r['method'], r['url'], r['headers'], r['body'])
        for _, r in df.iterrows()
    ])[FEATURE_COLUMNS]

    proba = clf.predict_proba(feats)
    classes = np.array(clf.classes_)
    top_idx = np.argmax(proba, axis=1)
    top_prob = proba[np.arange(len(proba)), top_idx]
    y_pred = np.where(top_prob >= threshold, classes[top_idx], 'benign')
    y_true = df['label'].astype(str).values

    print("=" * 70)
    print("  INDEPENDENT EVALUATION RESULTS")
    print("=" * 70)
    print(classification_report(y_true, y_pred, digits=4))

    labels_order = sorted(set(y_true) | set(y_pred))
    cm = confusion_matrix(y_true, y_pred, labels=labels_order)
    cm_df = pd.DataFrame(
        cm,
        index=[f"actual:{l}" for l in labels_order],
        columns=[f"pred:{l}" for l in labels_order]
    )
    print("Confusion matrix:")
    print(cm_df.to_string())


if __name__ == '__main__':
    main()
