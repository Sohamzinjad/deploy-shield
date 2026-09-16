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

---

## Fail-Closed Behaviour (Security Design Decision)

When the `ml-service` classifier is unreachable (network failure, container restart, OOM kill), the gateway **fails closed**: it returns `HTTP 503` and **does not forward the request** to the target application.

```
ml-service unavailable
        │
        ▼
Gateway → 503 Service Unavailable
         (request dropped, not forwarded)
```

### Why fail-closed rather than fail-open?

| Behaviour | Effect on availability | Effect on security |
|-----------|----------------------|-------------------|
| **Fail-closed** (chosen) | Requests blocked while ML is down | Attacks are never let through unscreened |
| Fail-open | Uninterrupted service | Every request passes during an outage — including attacks |

For a security gateway, a brief availability impact is acceptable. Silently bypassing the WAF during an outage is not. This mirrors the posture of established inline security appliances (e.g., ModSecurity in `SecRuleEngine On` mode).

**Implication for operations**: `ml-service` must be treated as a critical dependency. Health-check it separately (Docker `HEALTHCHECK`, or an uptime monitor) and alert on restarts.

---

## Known Security Limitation: Docker Socket Access in build-service

`build-service` mounts the Docker daemon socket (`/var/run/docker.sock`) to build images from user-supplied git repositories:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Risk**: This is effectively root on the host. A malicious repository could include a `Dockerfile` or `postinstall` script that escapes the container and accesses the host filesystem or network.

**Mitigations considered**:
- The build-service port is **not published** to the host network — it is only reachable from within `deployshield-net`. This limits the attack surface to authenticated users who can trigger a deploy.
- Future hardening options: rootless Docker (Podman), `gVisor` (runsc), or moving builds to an isolated VM / CI runner that has no socket access to the production host.

This is a deliberate trade-off documented here so that examiners and future contributors can assess the risk clearly.

---

## Latency Instrumentation

Every request classified by `ml-service` is timed inside the gateway using `Date.now()` before and after the HTTP call. Samples (up to the last 1,000) are kept in memory, and the **p50 and p95 classification latency** are exposed at:

```
GET /api/stats
→ { "p50_ms": 4, "p95_ms": 12, "request_count": 847, "confidence_threshold": 0.55 }
```

This answers the viva question _"what latency overhead does your inline WAF add?"_ with a measured, reproducible number rather than an estimate.

