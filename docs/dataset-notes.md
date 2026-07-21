# DeployShield Dataset & ML Evaluation Methodology

## 1. Dataset Sourcing & Taxonomy

*Placeholder for documenting dataset origin, preprocessing, and label distributions.*

- **Benign Requests**: Normal HTTP traffic logs (e.g., CSIC 2010 HTTP Dataset, HTTP GET/POST benchmarks).
- **Malicious Requests**:
  - **SQL Injection (SQLi)**: Payloads containing UNION SELECT, OR 1=1, conditional stacked queries.
  - **Cross-Site Scripting (XSS)**: Reflected/stored script tags, event handlers (`onerror=`, `onload=`), `javascript:` URIs.
  - **Command Injection**: Subshell tokens (`|`, `;`, `` ` ``), payload strings (`cat /etc/passwd`, `rm -rf`).

## 2. Hand-Engineered Feature Matrix (Baseline Model)

- `url_length`: Character length of the requested URI.
- `special_char_count`: Count and frequency of characters: `['\'', '"', '<', '>', ';', '|', '&', '%', '$', '-']`.
- `keyword_occurrences`: Binary or count vectorizer for security-sensitive tokens (e.g., `select`, `union`, `script`, `eval`).
- `entropy`: Shannon entropy of the query string and body payload.

## 3. Evaluation Metrics

- Precision & Recall per attack category
- F1-Score
- False Positive Rate (FPR) on benign web app requests
- Scoring Latency (p95 and p99 target: < 15ms)
