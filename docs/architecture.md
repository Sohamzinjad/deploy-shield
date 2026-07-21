# DeployShield Architecture & Data Flow

DeployShield is a lightweight application deployment gateway with an integrated machine-learning-based runtime security layer (WAF).

## System Overview

```
                          [ Client Request ]
                                   │
                                   ▼
                         ┌───────────────────┐
                         │   /gateway        │
                         │ (Express Proxy)   │
                         └─────────┬─────────┘
                                   │
                    1. POST /classify (Request metadata)
                                   │
                                   ▼
                         ┌───────────────────┐
                         │   /ml-service     │
                         │ (FastAPI + ML)    │
                         └─────────┬─────────┘
                                   │
                    2. Classification Verdict
                       (Benign / Malicious + Score)
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
         [ IF MALICIOUS ]                     [ IF BENIGN ]
                 │                                   │
                 ▼                                   ▼
     Respond 403 Forbidden                 Forward request to
     & Log to API Server                   Target Container
                                                     │
                                                     ▼
                                           ┌───────────────────┐
                                           │   Deployed App    │
                                           │ (Docker Container)│
                                           └───────────────────┘
```

## Data Flow Details

1. **Client Request**: An incoming HTTP request arrives at the Gateway (`http://localhost:8000/apps/:appId/*`).
2. **ML Classification**: Prior to proxying the request, the Gateway extracts request metadata (`method`, `url`, `headers`, `body`) and calls `POST http://ml-service:8000/classify` on the `ml-service`.
3. **Verdict Evaluation**:
   - **Malicious**: If `is_malicious` is `true` (confidence score >= 0.8 threshold), the Gateway aborts proxying, returns an HTTP `403 Forbidden` response to the client, and posts the security violation log to `api-server` (`POST /api/logs`).
   - **Benign**: If `is_malicious` is `false`, the Gateway queries `api-server` for the target container address of `:appId` and proxies the request to the container.
4. **Deploy Lifecycle**:
   - `build-service`: Accepts git URLs (or local template paths), clones the code, builds Docker container images locally, runs container instances on `deployshield-net`, and registers the container endpoints with `api-server`.
   - `api-server`: Central control plane API for app registration (`POST /api/apps/register`), deployment triggers (`POST /api/apps/deploy`), app listing (`GET /api/apps`), and security logs (`GET /api/logs`).
   - `frontend`: React dashboard for viewing real-time security telemetry, deployment controls, and live threat event logs.

## Routing Strategy Decision: Path Prefix vs. Subdomain Routing

DeployShield uses **Path Prefix Routing** (`/apps/:appId/*`) instead of Subdomain Routing (`:appId.localhost`).

### Rationale:
1. **Zero Configuration**: Path prefix routing works out-of-the-box in local environments, Docker Compose, standard browsers, and `curl` without requiring `/etc/hosts` edits, local DNS resolvers (like `dnsmasq`), or wildcard SSL/proxy configurations.
2. **Deterministic Proxying**: The Gateway can cleanly parse the target application identifier directly from `req.params.appId` and strip the `/apps/:appId` prefix before forwarding the inner URL to the container.
3. **Simplicity for Viva / Defense Demonstrations**: Allows testing multiple applications side-by-side using straightforward URLs (e.g., `http://localhost:8000/apps/app-1/` and `http://localhost:8000/apps/app-2/`).
