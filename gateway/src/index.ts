import express, { Request, Response, NextFunction } from 'express';
import proxy from 'express-http-proxy';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 8000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://ml-service:8000';
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://api-server:5000';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
let CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.8');

// ── Latency tracking ─────────────────────────────────────────────────────────
const MAX_LATENCY_SAMPLES = 1000;
const latencySamples: number[] = [];
let totalRequests = 0;

function recordLatency(ms: number): void {
  latencySamples.push(ms);
  if (latencySamples.length > MAX_LATENCY_SAMPLES) latencySamples.shift();
  totalRequests++;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function getLatencyStats(): { p50_ms: number; p95_ms: number; request_count: number } {
  const sorted = [...latencySamples].sort((a, b) => a - b);
  return {
    p50_ms: Math.round(percentile(sorted, 50)),
    p95_ms: Math.round(percentile(sorted, 95)),
    request_count: totalRequests,
  };
}



app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for frontend requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.header('origin');
  if (origin && FRONTEND_ORIGIN.split(',').map((value) => value.trim()).includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

function isAdminToken(req: Request): boolean {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) return false;
  try {
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    return header.alg === 'HS256' && payload.role === 'admin' &&
      (!payload.exp || payload.exp > Math.floor(Date.now() / 1000)) &&
      expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void | Response {
  if (!isAdminToken(req)) return res.status(401).json({ error: 'Administrator authentication required' });
  next();
}

// Dynamic Security Sensitivity Control is restricted to dashboard administrators.
app.get('/config', (req: Request, res: Response) => {
  res.json({ confidenceThreshold: CONFIDENCE_THRESHOLD });
});

app.post('/config', requireAdmin, (req: Request, res: Response) => {
  const { threshold } = req.body;
  if (typeof threshold === 'number' && threshold >= 0.1 && threshold <= 1.0) {
    CONFIDENCE_THRESHOLD = threshold;
    console.log(`[Gateway Config] Updated protection sensitivity threshold to ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%`);
    return res.json({ success: true, confidenceThreshold: CONFIDENCE_THRESHOLD });
  }
  res.status(400).json({ error: 'Threshold must be a number between 0.1 and 1.0' });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ service: 'gateway', status: 'ok' });
});

// Latency & throughput stats endpoint
app.get('/api/stats', (req: Request, res: Response) => {
  res.json({ ...getLatencyStats(), confidence_threshold: CONFIDENCE_THRESHOLD });
});

// Middleware: ML Classification and Security Interception
const mlSecurityMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Skip security classification for gateway health check
  if (req.path === '/health') {
    return next();
  }

  try {
    const payload = {
      method: req.method,
      url: req.originalUrl,
      headers: {
        'user-agent': req.headers['user-agent'] || '',
        'content-type': req.headers['content-type'] || ''
      },
      body: req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
        ? JSON.stringify(req.body)
        : (typeof req.body === 'string' ? req.body : '')
    };

    // 1. Send request metadata to ml-service /classify endpoint (timed)
    const mlStart = Date.now();
    const mlResponse = await fetch(`${ML_SERVICE_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    recordLatency(Date.now() - mlStart);

    if (!mlResponse.ok) {
      console.warn(`[Gateway Warning] ML service returned HTTP ${mlResponse.status}`);
      return res.status(503).json({ error: 'Security classifier unavailable; request was not forwarded' });
    }

    const result: any = await mlResponse.json();

    // Record scored request telemetry in api-server
    fetch(`${API_SERVER_URL}/api/telemetry/scored`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Token': INTERNAL_SERVICE_TOKEN
      },
      body: JSON.stringify({ increment: 1 })
    }).catch(() => {});


    // 2. Check if request is malicious above confidence threshold
    if (result.is_malicious && result.confidence >= CONFIDENCE_THRESHOLD) {
      console.warn(`[SECURITY BLOCK] Path: ${req.originalUrl} | Threat: ${result.label} | Score: ${result.confidence}`);

      // 3. Log event to api-server
      try {
        await fetch(`${API_SERVER_URL}/api/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Service-Token': INTERNAL_SERVICE_TOKEN },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            clientIp: req.ip || req.socket.remoteAddress || '127.0.0.1',
            method: req.method,
            path: req.originalUrl,
            attackType: result.label.toUpperCase(),
            confidence: result.confidence,
            action: 'BLOCKED'
          })
        });
      } catch (logErr: any) {
        console.error('[Gateway Error] Failed logging event to api-server:', logErr.message);
      }

      // 4. Block request with 403 Forbidden
      return res.status(403).json({
        error: 'Access Denied — Blocked by DeployShield Runtime ML Security Layer',
        threatDetected: result.label,
        confidenceScore: result.confidence,
        timestamp: new Date().toISOString()
      });
    }

    // Benign request -> proceed to routing
    next();
  } catch (err: any) {
    console.error('[Gateway Error] ML classification middleware error:', err.message);
    return res.status(503).json({ error: 'Security classifier unavailable; request was not forwarded' });
  }
};

// Subdomain-based Vercel-style routing: http://<subdomain>.localhost:8081/*
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const hostHeader = (req.headers.host || '').split(':')[0].toLowerCase();

  // If host is a subdomain like <app>.localhost or <app>.localtest.me
  const isSubdomain =
    hostHeader.endsWith('.localhost') ||
    hostHeader.endsWith('.localtest.me') ||
    (hostHeader.split('.').length > 1 && !['localhost', '127.0.0.1', 'gateway'].includes(hostHeader));

  if (!isSubdomain) {
    return next();
  }

  const subdomain = hostHeader
    .replace(/\.(localhost|localtest\.me)$/, '')
    .split('.')[0];

  if (!subdomain || ['www', 'api', 'gateway', 'admin'].includes(subdomain)) {
    return next();
  }

  // First apply ML security classification to protect subdomain traffic
  mlSecurityMiddleware(req, res, async () => {
    try {
      const apiRes = await fetch(`${API_SERVER_URL}/api/apps/by-domain/${encodeURIComponent(subdomain)}`, {
        headers: { 'X-Internal-Service-Token': INTERNAL_SERVICE_TOKEN }
      });

      if (!apiRes.ok) {
        return res.status(404).json({
          error: `DeployShield: No application found assigned to domain '${hostHeader}'`,
          hint: 'Verify the project name or ID matches your subdomain.'
        });
      }

      const appData: any = await apiRes.json();
      const targetUrl = appData.targetUrl || appData.target_url;
      if (!targetUrl || appData.status !== 'running') {
        return res.status(503).json({
          error: `DeployShield: Application '${appData.name || subdomain}' is not currently running (status: ${appData.status})`
        });
      }

      // Proxy request directly to container root — preserves root-relative paths, SPAs, and WebSockets!
      proxy(targetUrl, {
        proxyReqPathResolver: (proxyReq) => proxyReq.originalUrl
      })(req, res, next);
    } catch (err: any) {
      console.error(`[Gateway Subdomain Error] Proxy error for domain ${hostHeader}:`, err.message);
      res.status(502).json({ error: `Bad Gateway — Failed proxying request to ${hostHeader}` });
    }
  });
});

// Route: /apps/:appId/* -> Reverse proxy to deployed app container (legacy path routing)
app.use('/apps/:appId', mlSecurityMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const appIdParam = req.params.appId;
  // Express permits repeated path parameters, which are represented as an
  // array. This route addresses exactly one application, so reject those
  // malformed requests instead of accidentally coercing them into an ID.
  if (Array.isArray(appIdParam) || !appIdParam) {
    return res.status(400).json({ error: 'A single application ID is required' });
  }
  const appId = appIdParam;

  try {
    // Query api-server for app target container address
    const apiRes = await fetch(`${API_SERVER_URL}/api/apps/${appId}`, {
      headers: { 'X-Internal-Service-Token': INTERNAL_SERVICE_TOKEN }
    });
    if (!apiRes.ok) {
      return res.status(404).json({ error: `Application '${appId}' not found in registry` });
    }

    const appData: any = await apiRes.json();
    const targetUrl = appData.targetUrl || appData.target_url;
    if (!targetUrl || appData.status !== 'running') {
      return res.status(503).json({ error: `Application '${appId}' is not currently running (status: ${appData.status})` });
    }

    // Dynamic proxy to container targetUrl
    proxy(targetUrl, {
      proxyReqPathResolver: (proxyReq) => {
        // Strip /apps/:appId prefix so container receives subpath (e.g. /apps/app-1/hello -> /hello)
        const subpath = proxyReq.originalUrl.replace(new RegExp(`^/apps/${appId}`), '');
        return subpath === '' ? '/' : subpath;
      },
      userResDecorator: (proxyRes, proxyResData) => {
        const contentType = String(proxyRes.headers['content-type'] || '');
        if (!contentType.includes('text/html')) return proxyResData;

        const prefix = `/apps/${encodeURIComponent(appId)}`;
        return proxyResData
          .toString('utf8')
          .replace(/\b(src|href|action)=(['"])\/(?!\/)/gi, `$1=$2${prefix}/`)
          .replace(/url\((['"]?)\/(?!\/)/gi, `url($1${prefix}/`);
      }
    })(req, res, next);
  } catch (err: any) {
    console.error(`[Gateway Error] Proxy error for app ${appId}:`, err.message);
    res.status(502).json({ error: `Bad Gateway — Failed proxying request to app ${appId}` });
  }
});

// Fallback route handler
app.all('*', mlSecurityMiddleware, (req: Request, res: Response) => {
  res.status(404).json({
    message: 'DeployShield Gateway — Unknown route',
    hint: 'Use http://<app-name>.localhost:8081 or /apps/:appId/ to reach deployed applications'
  });
});


if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Gateway listening on port ${PORT}`);
  });
}

export default app;
