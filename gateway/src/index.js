const express = require('express');
const proxy = require('express-http-proxy');

const app = express();
const PORT = process.env.PORT || 8000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://ml-service:8000';
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://api-server:5000';
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.8');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ service: 'gateway', status: 'ok' });
});

// Middleware: ML Classification and Security Interception
const mlSecurityMiddleware = async (req, res, next) => {
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
      body: typeof req.body === 'object' ? JSON.stringify(req.body) : (req.body || '')
    };

    // 1. Send request metadata to ml-service /classify endpoint
    const mlResponse = await fetch(`${ML_SERVICE_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!mlResponse.ok) {
      console.warn(`[Gateway Warning] ML service returned HTTP ${mlResponse.status}`);
      return next(); // Fail-open for proxy continuity if ML service errors in stub mode
    }

    const result = await mlResponse.json();

    // 2. Check if request is malicious above confidence threshold
    if (result.is_malicious && result.confidence >= CONFIDENCE_THRESHOLD) {
      console.warn(`[SECURITY BLOCK] Path: ${req.originalUrl} | Threat: ${result.label} | Score: ${result.confidence}`);

      // 3. Log event to api-server
      try {
        await fetch(`${API_SERVER_URL}/api/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      } catch (logErr) {
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
  } catch (err) {
    console.error('[Gateway Error] ML classification middleware error:', err.message);
    next();
  }
};

// Route: /apps/:appId/* -> Reverse proxy to deployed app container
app.use('/apps/:appId', mlSecurityMiddleware, async (req, res, next) => {
  const { appId } = req.params;

  try {
    // Query api-server for app target container address
    const apiRes = await fetch(`${API_SERVER_URL}/api/apps/${appId}`);
    if (!apiRes.ok) {
      return res.status(404).json({ error: `Application '${appId}' not found in registry` });
    }

    const appData = await apiRes.json();
    if (!appData.targetUrl || appData.status !== 'running') {
      return res.status(503).json({ error: `Application '${appId}' is not currently running (status: ${appData.status})` });
    }

    // Dynamic proxy to container targetUrl
    proxy(appData.targetUrl, {
      proxyReqPathResolver: (proxyReq) => {
        // Strip /apps/:appId prefix so container receives subpath (e.g. /apps/app-1/hello -> /hello)
        const subpath = proxyReq.originalUrl.replace(new RegExp(`^/apps/${appId}`), '');
        return subpath === '' ? '/' : subpath;
      }
    })(req, res, next);
  } catch (err) {
    console.error(`[Gateway Error] Proxy error for app ${appId}:`, err.message);
    res.status(502).json({ error: `Bad Gateway — Failed proxying request to app ${appId}` });
  }
});

// Fallback route handler
app.all('*', mlSecurityMiddleware, (req, res) => {
  res.status(404).json({
    message: 'DeployShield Gateway — Unknown route',
    hint: 'Use /apps/:appId/ to reach deployed applications'
  });
});

app.listen(PORT, () => {
  console.log(`Gateway listening on port ${PORT}`);
});
