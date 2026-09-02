# DeployShield 🛡️

**DeployShield** is a lightweight application deployment gateway with an integrated machine-learning-powered runtime security layer.

Built as a college major project, DeployShield focuses on runtime application security by inspecting incoming HTTP requests before they reach deployed containers. Requests are analyzed by a dedicated ML inference service to identify and block threats such as **SQL Injection (SQLi)**, **Cross-Site Scripting (XSS)**, and **Command Injection** attacks in real time.

---

# 🚀 Key Features

- ML-powered runtime threat detection
- Reverse proxy request interception
- Automated application deployment from Git repositories
- Containerized build and deployment workflow
- Real-time security telemetry dashboard
- JWT-based authentication system
- Centralized application and security event management

---

# 🏗️ System Architecture

```text
.
├── gateway/
├── ml-service/
├── api-server/
├── build-service/
├── frontend/
├── docs/
└── docker-compose.yml
```

# ⚙️ Services Overview

## Gateway (Port 8000)
- Express reverse proxy
- Request interception
- ML service integration
- Threat blocking

## ML Service (Port 8002)
- FastAPI inference service
- RandomForestClassifier (`baseline.pkl`)
- SQLi, XSS, Command Injection detection

## API Server (Port 5000)
- Application registry
- Security logs
- JWT authentication
- Statistics endpoints

### Demo Credentials

```text
Username: admin
Password: password123
```

## Build Service (Port 5001)
- Git clone
- Docker build
- Container deployment
- Route registration

## Frontend (Port 3000)
- React dashboard
- Threat telemetry
- Deployment management
- Authentication UI

---

# 🐳 Running Locally

```bash
docker compose up --build
```

## Access URLs

- Frontend: http://localhost:3000
- Gateway: http://localhost:8000
- API: http://localhost:5000
- ML Docs: http://localhost:8002/docs
- Build Service: http://localhost:5001

---

# 📊 Current Status

## Completed

- RandomForest ML model integrated
- JWT authentication
- Login endpoint
- React AuthContext
- Protected dashboard
- Dockerized deployment

## Planned Improvements

- Logout endpoint
- Refresh-token flow
- Database-backed users
- ProtectedRoute component
- Docker health checks
- GitHub Actions CI/CD
- Integration testing
- Dark mode and UI polish

---

# 🎓 Academic Project

DeployShield demonstrates the integration of:

- Machine Learning
- Runtime Security
- Containerized Deployments
- Cloud-Native Architecture
- Full-Stack Development

to provide intelligent protection for deployed applications.
