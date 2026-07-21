# DeployShield ML Model Architecture & Training Methodology

This document outlines the machine learning pipeline, feature engineering matrix, model selection rationale, and metric evaluation logging for DeployShield's runtime security classifier.

---

## 1. Hand-Engineered Feature Matrix

Every incoming HTTP request is transformed into a fixed-length numerical feature vector by `ml-service/features.py`:

| Feature Name | Feature Type | Description |
| :--- | :--- | :--- |
| `url_length` | Numerical (Integer) | Total character length of the request URI path and query parameters. |
| `body_length` | Numerical (Integer) | Total character length of the HTTP request payload body. |
| `special_char_count` | Numerical (Integer) | Aggregate frequency of security-sensitive characters: `['\'', '"', '<', '>', ';', '--', '|', '&', '$', '%', '`']`. |
| `sqli_pattern_count` | Numerical (Integer) | Regex match counts for SQL Injection tokens (e.g. `union select`, `or 1=1`, `select...from`, `information_schema`, `'--`, `drop table`, `exec(`). |
| `xss_pattern_count` | Numerical (Integer) | Regex match counts for Cross-Site Scripting tokens (e.g. `<script>`, `javascript:`, `onerror=`, `onload=`, `document.cookie`, `eval(`, `alert(`). |
| `cmd_pattern_count` | Numerical (Integer) | Regex match counts for Command Injection tokens (e.g. `; rm`, `| bash`, `| sh`, `cat /etc`, `` ` ``, `$(`, `wget`, `curl`). |
| `header_count` | Numerical (Integer) | Total number of HTTP headers sent with the request. |

---

## 2. Model Selection Rationale: RandomForestClassifier vs. Logistic Regression

DeployShield uses **`scikit-learn`'s `RandomForestClassifier`** as its baseline model.

### Why Random Forest over Logistic Regression?
1. **Non-Linear Interactions**: Web attack payloads exhibit strong non-linear relationships. For instance, a long URL alone is benign, but a long URL *combined* with high special character counts and regex pattern hits indicates an attack. Tree ensembles capture these feature interactions naturally without manual polynomial feature engineering.
2. **Robustness to Feature Scales**: Features like `url_length` (values up to hundreds or thousands) operate on vastly different scales than `sqli_pattern_count` (values typically 0 to 5). Random Forests are scale-invariant and do not require normalization/standardization pre-processing.
3. **Multi-Class Attack Labeling**: Random Forest easily handles multi-class target labels (`benign`, `sqli`, `xss`, `cmd_injection`) with native output class probability distributions (`predict_proba`).

---

## 3. Training & Evaluation Pipeline

Training is initiated by running:
```bash
python ml-service/train.py
```

### Execution Steps
1. Loads dataset CSV from `ml-service/data/*.csv`.
2. Extracts feature vectors using `features.py`.
3. Performs an **80/20 Stratified Train/Test Split** to maintain exact class proportions in both sets.
4. Fits `RandomForestClassifier(n_estimators=100, max_depth=15, class_weight='balanced')`.
5. Computes test-set metrics and saves the serialized model bundle to `ml-service/models/baseline.pkl`.

### Metric Logging & Output Location
When `python train.py` completes, detailed performance metrics are printed directly to `stdout` and logged in the terminal console:
- **Overall Test Accuracy**
- **Classification Report**: Per-class Precision, Recall, and F1-Score.
- **Confusion Matrix**: A tabular true-versus-predicted matrix detailing misclassification patterns.
