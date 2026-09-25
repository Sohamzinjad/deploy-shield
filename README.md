# DeployShield

DeployShield is a single-host deployment demo with a security gateway. A user deploys a Git repository from the React dashboard; the control-plane API asks the internal build service to build and run it; the gateway sends each request to the ML classifier before proxying allowed traffic to the deployed container.

It is a learning/demo project, not a production deployment platform. Its classifier uses lightweight request features and should complement—not replace—application security controls, rate limiting, and a maintained WAF.

## Run locally

Docker Desktop must be running because the build service creates application containers through the Docker socket.

```sh
cp .env.example .env
# Edit .env: replace POSTGRES_PASSWORD, JWT_SECRET, and INTERNAL_SERVICE_TOKEN.
docker compose up --build
```

Open `http://localhost:3000` and sign in with the `ADMIN_USER` and `ADMIN_PASSWORD` configured in your `.env` file. The public endpoints are the dashboard (3000), API (5003), and protected gateway (8081). The database, classifier, and Docker-socket build service stay on the internal Docker network.

## Request flow

```
Browser → gateway → ML classifier → deployed container
   │          └─ blocked requests → API security log
   └→ API → internal build service → Docker engine
```

The API authenticates dashboard calls with JWTs. Gateway configuration requires an administrator JWT; gateway and build-service calls to the API require `INTERNAL_SERVICE_TOKEN`.

## Development checks

```sh
npm ci --prefix api-server && npm test --prefix api-server -- --runInBand
npm run build --prefix api-server
npm run build --prefix gateway
npm run build --prefix build-service
npm run build --prefix frontend
```

## Important constraints

- Only HTTP(S) repository URLs without embedded credentials are accepted.
- Deployed containers are not published directly to host ports; access them through `/apps/:appId/` on the gateway.
- Building untrusted repositories is inherently risky. Run this stack only on an isolated development machine and do not expose the Docker socket or build service to the internet.
