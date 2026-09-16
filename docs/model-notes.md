# DeployShield ML Model Architecture & Training Methodology

This document outlines the machine learning pipeline, feature engineering matrix, model selection rationale, and metric evaluation logging for DeployShield's runtime security classifier.

---

## 1. Hand-Engineered Feature Matrix

Every incoming HTTP request is transformed into a fixed-length numerical feature vector by [`ml-service/features.py`](../ml-service/features.py):

| Feature Name | Type | Description |
| :--- | :--- | :--- |
| `url_length` | Integer | Total character length of the decoded URI. |
| `body_length` | Integer | Character length of the decoded request body. |
| `path_segment_count` | Integer | Number of `/`-separated path segments (e.g. `/a/b/c` → 3). Structural feature that does not scale with payload length. |
| `non_alnum_ratio` | Float 0–1 | Fraction of combined (URL + body) characters that are non-alphanumeric. Scale-invariant; does not conflate long URLs with attacks. |
| `entropy_query` | Float | Shannon entropy (bits/char) of the query string. Attack payloads are typically higher entropy than normal param values. |
| `encoded_sequence_count` | Integer | Count of `%XX` percent-encoded sequences in URL + body. Catches double-encoded evasion. |
| `special_char_count` | Integer | Aggregate frequency of `'`, `"`, `<`, `>`, `;`, `--`, `\|`, `&`, `$`, `%`, `` ` ``. |
| `sqli_pattern_count` | Integer | Regex matches for SQLi tokens including comment obfuscation (`/**/`) and hex encoding (`0x…`). |
| `xss_pattern_count` | Integer | Regex matches for XSS tokens (`<script>`, `onerror=`, `javascript:`, `data:text/html`, …). |
| `cmd_pattern_count` | Integer | Regex matches for command injection tokens (`|bash`, `cat /etc`, `$(`, netcat, python -c, …). |
| `header_count` | Integer | Number of HTTP headers in the request. |
| `method_get` … `method_options` | Float (0/1) | One-hot encoding of the HTTP method. Lets the model learn that GET + long payload is different from POST + long payload. |

> **URL decoding is iterative** (up to 3 passes) to defeat double-encoded evasion (`%2527` → `%27` → `'`).

---

## 2. Model Selection Rationale: RandomForestClassifier

DeployShield uses `scikit-learn`'s `RandomForestClassifier` as its baseline model.

| Criterion | Random Forest | Logistic Regression | Neural Network |
|-----------|:---:|:---:|:---:|
| Non-linear feature interactions | ✅ | ❌ | ✅ |
| Scale-invariant (no normalisation needed) | ✅ | ❌ | ❌ |
| Interpretable feature importances | ✅ | Partial | ❌ |
| Fast training on 50k rows | ✅ | ✅ | ❌ |
| Native multi-class `predict_proba` | ✅ | ✅ | ✅ |

Random Forest wins on all criteria that matter for this project size and for a viva audience that will ask "why this model?"

---

## 3. Training Pipeline

```bash
python ml-service/train.py
```

1. Load `ml-service/data/dataset.csv`.
2. Drop exact duplicate rows (leakage guard).
3. Extract features using `features.py` (same code as inference — no skew).
4. 80/20 stratified train/test split, `random_state=42`.
5. Print **majority-class baseline** accuracy for comparison.
6. Fit `RandomForestClassifier(n_estimators=200, class_weight='balanced')`.
7. Print per-class `classification_report`, confusion matrix, feature importances.
8. Save `ml-service/models/baseline.pkl`.

> **Never report overall accuracy alone.** The dataset is imbalanced. Always compare against the majority-class baseline.

---

## 4. Threshold Calibration

The confidence threshold is not chosen by feel — it is selected empirically:

```bash
python ml-service/threshold_sweep.py
```

This script:
- Sweeps thresholds from 0.30 → 0.95.
- Reports detection rate and false-positive rate at each point.
- Picks the operating point that **maximises detection rate subject to FPR ≤ 5%**.
- Saves `docs/threshold_curve.png` (embed in the report).
- Saves `docs/threshold_chosen.txt` (read by `evaluation/evaluate.py`).

Set `CONFIDENCE_THRESHOLD` in `gateway/.env` (or the Docker Compose env block) to the value from `threshold_chosen.txt`.

---

## 5. Attacks This Model Does NOT Catch

Be ready to answer this in the viva:

- **Logic flaws / business-logic abuse** — not visible in a single request's syntax.
- **Auth bypass / IDOR** — require knowledge of the access control model.
- **Stateful multi-step attacks** — the model sees each request in isolation.
- **Encoded payloads beyond 3 decode passes** — rare in practice but theoretically possible.
- **Novel zero-day payloads** that do not match current regex patterns or statistical profile.

Knowing your limits reads as maturity. A WAF that claims to catch everything is a red flag.


