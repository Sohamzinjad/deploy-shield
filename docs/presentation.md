# DeployShield — Major Project Defense Presentation

> **A Lightweight Application Deployment Gateway with an Integrated Machine Learning-Based Runtime Security Layer**
> *College Major Project (Two-Semester Capstone)*

---

## Slide 1: Title & Project Abstract
- **Project Title**: DeployShield
- **Subtitle**: Runtime Web Threat Detection built natively into the Deployment Pipeline
- **Core Premise**: Intercepts, scores, and filters incoming HTTP traffic using a trained ML model before requests reach deployed containerized applications.

---

## Slide 2: The Problem
- **Immediate Threat Exposure**: Newly deployed web apps are immediately targeted by automated botnets probing for SQLi, XSS, and command injection vulnerabilities.
- **Reliance on Code Perfection**: Small teams and student projects deploy without security proxies, relying entirely on 100% bug-free application code.
- **Expensive Enterprise Afterthought**: Traditional platforms treat security as a separate, expensive add-on (enterprise WAFs, CDN rulesets) rather than an integrated deployment feature.

---

## Slide 3: The Core Idea
- **Push a Repo ➔ Get a Protected App**: Security built-in by default from day one.
- **Synchronous Request Interception**: The Gateway reverse proxy intercepts every request, queries the ML service, and either blocks malicious payloads (HTTP 403) or proxies benign traffic transparently.
- **Real ML Engine**: Powered by trained classifiers (Random Forest / XGBoost) scoring hand-engineered HTTP features rather than hardcoded keyword blocklists.

---

## Slide 4: System Architecture & Data Flow
```text
  Client Request
        │
        ▼
   /gateway (Express Reverse Proxy)
        │
        ├─ 1. POST /classify (Method, URL, Headers, Body)
        ▼
   /ml-service (FastAPI + Trained Model)
        │
        ├─ 2. Verdict (Benign / Malicious + Score)
        ▼
  Decision Logic:
    • IF MALICIOUS: Respond HTTP 403 Forbidden & log event to API Server
    • IF BENIGN: Proxy request to target Docker Container
```

---

## Slide 5: Microservices Breakdown
1. **`/gateway` (Port 8000)**: Express reverse proxy intercepting `/apps/:appId/*` requests.
2. **`/ml-service` (Port 8002)**: Python FastAPI service extracting feature vectors and serving ML predictions.
3. **`/api-server` (Port 5000)**: REST API managing container routing tables and real-time security event logs.
4. **`/build-service` (Port 5001)**: Single-host build engine cloning repos, building Docker images, and launching container instances.
5. **`/frontend` (Port 3000)**: React dashboard rendering live security telemetry and deployment controls.

---

## Slide 6: What Makes It a Real Contribution
- **ML Thesis Focus**: Model trained on labeled HTTP datasets (e.g. CSIC 2010) and evaluated on Precision, Recall, and F1 per attack class.
- **Own Evaluation Data**: Synthetic and tool-assisted attack traffic generated using `sqlmap` and `OWASP ZAP` against sandboxed test apps.
- **Deliberately Scoped Platform Engine**: Platform features kept minimal (single-host Docker) so engineering depth centers on detection accuracy and false-positive trade-offs.

---

## Slide 7: Technology Stack
| Layer | Technology | Function |
|---|---|---|
| Gateway / Proxy | Node.js, Express, `express-http-proxy` | Request interception & routing |
| Build Service | Node.js, Docker CLI | Local container image builder |
| Control Plane API | Node.js, Express | App registry & security telemetry |
| ML Classifier | Python 3.11, FastAPI, `scikit-learn` | Feature extraction & model inference |
| Dashboard UI | React, Vite | Telemetry & live threat stream |
| Orchestration | Docker Compose | Local multi-container networking |

---

## Slide 8: Evaluation & Measurement Framework
- **Detection Accuracy**: Precision, Recall, and F1-score per attack class (SQLi, XSS, Command Injection).
- **False-Positive Rate (FPR)**: Benchmark on legitimate user traffic (target FPR < 0.5%).
- **Latency Overhead**: Measure p50, p95, and p99 overhead added by ML classification (target overhead < 15ms).
- **Mixed Traffic Stress Testing**: Measure gateway throughput under mixed benign and attack traffic loads.

---

## Slide 9: Scope Boundaries (What This Is Not)
- **Not a Commercial PaaS**: No multi-region, no CDN edge nodes, no custom domain SSL, no billing.
- **Not a Full WAF Replacement**: Focused on well-understood web attack categories, not all Layer-7 vectors.
- **The Value Contribution**: Proving the native security integration pattern and evaluating ML classification trade-offs rigorously.

---

## Slide 10: Team Tracks & Roadmap
- **Platform Track**: Gateway proxy, build engine, Docker container lifecycle, React telemetry dashboard.
- **Security / ML Track**: Dataset sourcing, `sqlmap`/`ZAP` traffic generation, feature engineering, model benchmarking.
- **Semester 1**: Scaffolding, end-to-end integration, baseline model pipeline, custom attack dataset generation.
- **Semester 2**: Model refinement, latency optimization, benchmarking, viva defense & live demo.
