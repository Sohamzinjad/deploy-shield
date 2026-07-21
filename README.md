# DeployShield 🛡️

> **DeployShield** is a lightweight application deployment gateway with an integrated machine-learning-based runtime security layer.

Designed as a college major project, DeployShield focuses on engineering depth in runtime security, intercepting HTTP requests before they reach deployed containers to score and block malicious payloads (SQLi, XSS, Command Injection) using a dedicated ML inference classifier.

---

## 🏗️ Repository Architecture

```text
.
├── gateway/          # Express reverse proxy intercepting requests & querying ml-service
├── ml-service/       # Python FastAPI service performing runtime threat classification
├── api-server/       # REST API managing app registry, deployments & security event logs
├── build-service/    # Single-host build engine (git clone -> Docker build -> container run)
├── frontend/         # React dashboard for threat telemetry and application management
├── docs/             # System architecture & ML dataset documentation
└── docker-compose.yml# Local multi-container development orchestration
```

### Services Overview

1. **`gateway` (Port 8000)**: Express-based reverse proxy. Extracts incoming HTTP request metadata (method, URL, headers, body) and calls `ml-service` (`POST /classify`) before proxying to destination app containers.
2. **`ml-service` (Port 8002 / internal 8000)**: Python FastAPI service running ML inference. Evaluates requests for malicious patterns and returns a verdict (`benign` / `malicious`), attack classification, and confidence score.
3. **`api-server` (Port 5000)**: Central control plane REST API storing application metadata, active container routes, and runtime security logs.
4. **`build-service` (Port 5001)**: Node.js worker that receives git repository URLs, builds Docker container images locally on the host, runs them, and registers their routes with `api-server`.
5. **`frontend` (Port 3000)**: React dashboard displaying live security metrics, blocked threat streams, and deployed application status.

---

## 🚀 Getting Started

### Prerequisites

- [Docker Engine](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/) (v2+)

### Running Locally

To launch all DeployShield services in local dev mode:

```bash
docker compose up --build
```

Access services at:
- **Frontend Dashboard**: `http://localhost:3000`
- **Gateway Proxy**: `http://localhost:8000`
- **API Server**: `http://localhost:5000`
- **ML Service API Docs**: `http://localhost:8002/docs`
- **Build Service**: `http://localhost:5001`

---

## 📖 Documentation

- [Architecture & Data Flow](file:///Users/sohamzinjad/vercel/docs/architecture.md)
- [ML Dataset & Methodology Notes](file:///Users/sohamzinjad/vercel/docs/dataset-notes.md)
