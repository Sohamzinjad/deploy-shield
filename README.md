# DeployShield – Project Status & Next Steps

## What’s currently implemented
- **ML Model** – Trained `RandomForestClassifier` (`baseline.pkl`) and inference script (`predict_helper.py`).
- **API Server** (`api-server/src/`)
  - Express server with routes for apps, logs, stats, and health.
  - JWT utilities (`src/auth.js`) with token generation and verification.
  - **Login endpoint** (`src/login.js`) that returns a token for demo credentials `admin / password123`.
  - Middleware now allows `/login` and `/health` without a token.
- **Frontend** (`frontend/src/`)
  - Vite + React dashboard consuming `/api/*` endpoints.
  - **AuthContext** (`src/context/AuthContext.jsx`) for storing the JWT in `localStorage`.
  - Login guard added to `App.jsx` – shows a login form when no token is present.
  - UI wrapped with `<AuthProvider>` in `main.jsx`.
- **Docker** – Multi‑stage `Dockerfile` builds both backend and frontend, bundles the model, and exposes ports `5000` (API) and `3000` (UI).

## What’s still lacking
| Area | Missing Piece | Why it matters |
|------|----------------|----------------|
| **Backend** | 1. **Logout endpoint** (optional) <br> 2. **Refresh‑token flow** (production‑grade security) <br> 3. **User storage** – currently hard‑coded demo credentials. | Enables proper session handling and future user management. |
| **Frontend** | 1. **Logout UI** (clear token). <br> 2. **Protected route component** (e.g., `<ProtectedRoute>`) for any future pages. <br> 3. **Error handling UI** for auth failures. | Improves UX and makes the auth system reusable across pages. |
| **Docker / Deployment** | 1. **Health‑check** instruction in the Dockerfile. <br> 2. **docker‑compose.yml** to orchestrate UI + API together (avoids manual port mapping). | Makes local development and future production deployment smoother. |
| **CI/CD** | `.github/workflows/ci.yml` to lint, run unit tests, and build the Docker image automatically. | Guarantees that the repository stays buildable and tests pass on every push. |
| **Testing** | Integration tests for the login flow and protected `/api/predict` endpoint. | Prevent regressions when auth logic changes. |
| **Documentation** | README (this file) – summarises the project, how to run it, and next steps. | Helps new contributors understand the state of the project. |

## Proposed changes (next sprint)
1. **Add logout support**
   - Backend: `POST /logout` that simply returns `200 OK` (client will drop the token).
   - Frontend: Button in the dashboard that calls `auth.logout()` and redirects to the login screen.
2. **Create a `ProtectedRoute` component**
   - Wraps any component and checks `auth.token`; redirects to `/login` if missing.
3. **Add Docker health‑check**
   ```Dockerfile
   HEALTHCHECK --interval=30s --timeout=5s \
       CMD curl -f http://localhost:${PORT}/health || exit 1
   ```
4. **Introduce `docker‑compose.yml`**
   ```yaml
   version: "3.9"
   services:
     api:
       build: .
       ports:
         - "5000:5000"
       environment:
         - VITE_API_SERVER_URL=http://api:5000
     ui:
       image: deployshield:local
       ports:
         - "3000:3000"
       depends_on:
         - api
   ```
5. **CI workflow** (`.github/workflows/ci.yml`)
   - `npm ci` for both `api-server` and `frontend`.
   - Lint with `eslint`/`stylelint`.
   - Run a simple integration test that:
     1. Starts the API container.
     2. Calls `/login` with the demo credentials.
     3. Uses the returned token to call `/api/predict` and checks for a `200` response.
   - Build the Docker image.
6. **Add a logout button** in the dashboard UI (styled to match the premium design).
7. **Polish UI**
   - Ensure all forms use the same gradient/button style.
   - Add a dark‑mode toggle using CSS variables.
   - Add subtle micro‑animations for card hover and button presses.

## How to run the project now
```bash
# Build the Docker image (already done)
# Start the container
docker rm -f deployshield_ui   # ensure no stale container
docker run -d \
  -p 5000:5000 \
  -p 3000:3000 \
  -e VITE_API_SERVER_URL=http://localhost:5000 \
  --name deployshield_ui \
  deployshield:local

# Open the UI
open http://localhost:3000
# Login with:
#   username: admin
#   password: password123
```

Once the UI loads, you’ll see the dashboard. All API calls now include the JWT token automatically via the `AuthContext`.
