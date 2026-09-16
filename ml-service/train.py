import os
import pandas as pd
import numpy as np
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, ConfusionMatrixDisplay

from features import extract_features_dict, FEATURE_COLUMNS

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
MODEL_PATH = os.path.join(MODELS_DIR, 'baseline.pkl')


def train():
    os.makedirs(MODELS_DIR, exist_ok=True)
    dataset_path = os.path.join(DATA_DIR, 'dataset.csv')

    print(f"Loading dataset from: {dataset_path}")
    df = pd.read_csv(dataset_path)

    df.fillna({'method': 'GET', 'url': '', 'headers': '{}', 'body': '', 'label': 'benign'}, inplace=True)
    print(f"Dataset loaded: {len(df)} total rows.")

    # ── Duplicate check (leakage guard) ──────────────────────────────────────
    n_dupes = df.duplicated(subset=['method', 'url', 'headers', 'body', 'label']).sum()
    if n_dupes > 0:
        print(f"[WARNING] {n_dupes} exact duplicate rows found — dropping them.")
        df = df.drop_duplicates(subset=['method', 'url', 'headers', 'body', 'label'])
        print(f"  Rows after dedup: {len(df)}")

    print("\nLabel distribution:\n", df['label'].value_counts())

    print("\nExtracting request features ...")
    features_list = [
        extract_features_dict(row['method'], row['url'], row['headers'], row['body'])
        for _, row in df.iterrows()
    ]
    X = pd.DataFrame(features_list)[FEATURE_COLUMNS]
    y = df['label'].astype(str)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    print(f"\nTrain: {len(X_train)} samples | Test: {len(X_test)} samples")

    # ── Majority-class baseline ───────────────────────────────────────────────
    majority_class = y_train.value_counts().idxmax()
    y_majority = pd.Series([majority_class] * len(y_test), index=y_test.index)
    majority_acc = accuracy_score(y_test, y_majority)
    print(f"\nMajority-class baseline (always predict '{majority_class}'): {majority_acc * 100:.2f}%")

    # ── Train model ───────────────────────────────────────────────────────────
    print("\nTraining RandomForestClassifier ...")
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=None,
        min_samples_leaf=2,
        random_state=42,
        class_weight='balanced',
        n_jobs=-1
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)

    print("\n" + "=" * 70)
    print(f"  MODEL ACCURACY: {acc * 100:.2f}%   (majority baseline: {majority_acc * 100:.2f}%)")
    print("=" * 70)
    print("\nPer-class classification report:")
    print(classification_report(y_test, y_pred, digits=4))

    print("\nConfusion matrix (rows=actual, cols=predicted):")
    labels_order = sorted(clf.classes_)
    cm = confusion_matrix(y_test, y_pred, labels=labels_order)
    cm_df = pd.DataFrame(cm, index=[f"actual:{l}" for l in labels_order],
                         columns=[f"pred:{l}" for l in labels_order])
    print(cm_df.to_string())

    # ── Feature importances ───────────────────────────────────────────────────
    fi = pd.Series(clf.feature_importances_, index=FEATURE_COLUMNS).sort_values(ascending=False)
    print("\nFeature importances:")
    print(fi.to_string())

    # ── Save model bundle ─────────────────────────────────────────────────────
    model_bundle = {
        'model': clf,
        'feature_columns': FEATURE_COLUMNS,
        'classes': clf.classes_.tolist(),
        'metrics': {
            'accuracy': acc,
            'majority_baseline': majority_acc,
            'test_samples': len(y_test)
        }
    }
    joblib.dump(model_bundle, MODEL_PATH)
    print(f"\n[SUCCESS] Model saved to: {MODEL_PATH}")


if __name__ == '__main__':
    train()


