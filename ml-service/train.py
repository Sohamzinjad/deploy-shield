import os
import glob
import sys
import pandas as pd
import numpy as np
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

from features import extract_features_dict, FEATURE_COLUMNS

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
MODEL_PATH = os.path.join(MODELS_DIR, 'baseline.pkl')

def train():
    os.makedirs(MODELS_DIR, exist_ok=True)
    csv_files = glob.glob(os.path.join(DATA_DIR, '*.csv'))

    if not csv_files:
        print(f"[ERROR] No dataset CSV file found in {DATA_DIR}/")
        print("Please place a CSV file (e.g., dataset.csv) with columns: method, url, headers, body, label")
        sys.exit(1)

    dataset_path = csv_files[0]
    print(f"Loading dataset from: {dataset_path}")
    df = pd.read_csv(dataset_path)

    required_cols = {'method', 'url', 'label'}
    if not required_cols.issubset(set(df.columns)):
        print(f"[ERROR] Dataset missing required columns: {required_cols - set(df.columns)}")
        sys.exit(1)

    # Ensure optional columns exist
    if 'headers' not in df.columns:
        df['headers'] = ''
    if 'body' not in df.columns:
        df['body'] = ''

    df.fillna({'method': 'GET', 'url': '', 'headers': '', 'body': '', 'label': 'benign'}, inplace=True)

    print(f"Dataset loaded: {len(df)} total rows.")
    print("Label distribution:\n", df['label'].value_counts())

    # Extract features
    print("\nExtracting hand-engineered request features...")
    feature_rows = []
    for idx, row in df.iterrows():
        feat = extract_features_dict(
            str(row['method']),
            str(row['url']),
            row['headers'],
            str(row['body'])
        )
        feature_rows.append(feat)

    X = pd.DataFrame(feature_rows, columns=FEATURE_COLUMNS)
    y = df['label'].astype(str)

    # Stratified 80/20 train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    print(f"\nTrain set: {len(X_train)} samples | Test set: {len(X_test)} samples")

    # Train RandomForestClassifier
    # Selected over Logistic Regression because tree ensembles robustly capture
    # non-linear feature interactions (length vs pattern counts) without requiring feature scaling.
    print("\nTraining RandomForestClassifier baseline model...")
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=15,
        random_state=42,
        class_weight='balanced'
    )
    clf.fit(X_train, y_train)

    # Test set evaluation
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)

    print("\n" + "="*60)
    print("              MODEL EVALUATION METRICS (TEST SET)          ")
    print("="*60)
    print(f"Overall Accuracy: {acc * 100:.2f}%\n")
    print("Classification Report (Precision, Recall, F1-Score):")
    print(classification_report(y_test, y_pred))

    print("Confusion Matrix:")
    labels_order = clf.classes_
    cm = confusion_matrix(y_test, y_pred, labels=labels_order)
    cm_df = pd.DataFrame(cm, index=[f"True:{l}" for l in labels_order], columns=[f"Pred:{l}" for l in labels_order])
    print(cm_df)
    print("="*60)

    # Save model pipeline bundle
    model_bundle = {
        'model': clf,
        'feature_columns': FEATURE_COLUMNS,
        'classes': labels_order.tolist(),
        'metrics': {
            'accuracy': acc,
            'test_samples': len(y_test)
        }
    }

    joblib.dump(model_bundle, MODEL_PATH)
    print(f"\n[SUCCESS] Trained model pipeline saved to: {MODEL_PATH}")

if __name__ == '__main__':
    train()
