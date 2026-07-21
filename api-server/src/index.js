const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
const BUILD_SERVICE_URL = process.env.BUILD_SERVICE_URL || 'http://build-service:5001';

app.use(cors());
app.use(express.json());

// In-memory data stores
const deployedApps = new Map();
const securityLogs = [];

// Seed initial sample app entry for immediate testing before build-service calls
deployedApps.set('sample-app-1', {
  id: 'sample-app-1',
  name: 'Sample Express App',
  repoUrl: 'local://sample-app',
  status: 'running',
  targetUrl: 'http://deployshield-app-sample-app-1:3000',
  hostPort: 8081,
  createdAt: new Date().toISOString()
});

app.get('/health', (req, res) => {
  res.json({ service: 'api-server', status: 'ok' });
});

// GET /api/apps - List all deployed apps
app.get('/api/apps', (req, res) => {
  res.json(Array.from(deployedApps.values()));
});

// GET /api/apps/:id - Get specific app target address
app.get('/api/apps/:id', (req, res) => {
  const appItem = deployedApps.get(req.params.id);
  if (!appItem) {
    return res.status(404).json({ error: 'App not found' });
  }
  res.json(appItem);
});

// POST /api/apps/register - Internal registration endpoint used by build-service
app.post('/api/apps/register', (req, res) => {
  const { id, name, repoUrl, targetUrl, hostPort } = req.body;
  if (!id || !targetUrl) {
    return res.status(400).json({ error: 'id and targetUrl are required' });
  }

  const appRecord = {
    id,
    name: name || id,
    repoUrl: repoUrl || 'N/A',
    status: 'running',
    targetUrl,
    hostPort: hostPort || null,
    createdAt: new Date().toISOString()
  };

  deployedApps.set(id, appRecord);
  console.log(`Registered deployed app [${id}] -> ${targetUrl}`);
  res.status(201).json({ message: 'App registered successfully', app: appRecord });
});

// POST /api/apps/deploy - Trigger build-service and store deployed app address
app.post('/api/apps/deploy', async (req, res) => {
  const { repoUrl, name } = req.body;
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required' });
  }

  const appId = `app-${Date.now().toString(36)}`;
  const appName = name || `App-${appId}`;

  // Pre-register status as building
  deployedApps.set(appId, {
    id: appId,
    name: appName,
    repoUrl,
    status: 'building',
    targetUrl: null,
    createdAt: new Date().toISOString()
  });

  try {
    // Trigger build-service
    const response = await fetch(`${BUILD_SERVICE_URL}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, appId, name: appName })
    });

    const buildResult = await response.json();

    if (!response.ok) {
      deployedApps.set(appId, {
        ...deployedApps.get(appId),
        status: 'failed',
        error: buildResult.error || 'Build failed'
      });
      return res.status(500).json({ error: buildResult.error || 'Build failed' });
    }

    const updatedApp = deployedApps.get(appId);
    res.status(202).json({
      message: 'Deployment triggered successfully',
      app: updatedApp,
      buildDetails: buildResult
    });
  } catch (err) {
    console.error('Error contacting build-service:', err);
    deployedApps.set(appId, {
      ...deployedApps.get(appId),
      status: 'failed',
      error: err.message
    });
    res.status(500).json({ error: `Build service communication error: ${err.message}` });
  }
});

// POST /api/logs - Ingest security event logs from Gateway
app.post('/api/logs', (req, res) => {
  const { timestamp, clientIp, method, path, attackType, confidence, action } = req.body;

  const eventLog = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: timestamp || new Date().toISOString(),
    clientIp: clientIp || req.ip || '127.0.0.1',
    method: method || 'GET',
    path: path || '/',
    attackType: attackType || 'Unknown',
    confidence: confidence || 0.9,
    action: action || 'BLOCKED'
  };

  securityLogs.unshift(eventLog);
  // Keep last 200 logs
  if (securityLogs.length > 200) {
    securityLogs.pop();
  }

  res.status(201).json({ message: 'Log recorded', event: eventLog });
});

// GET /api/logs - Return security event logs
app.get('/api/logs', (req, res) => {
  res.json(securityLogs);
});

// GET /api/stats - Compute live threat metrics
app.get('/api/stats', (req, res) => {
  const totalBlocked = securityLogs.length;
  const blocksByType = {};

  securityLogs.forEach((log) => {
    const type = log.attackType || 'Unknown';
    blocksByType[type] = (blocksByType[type] || 0) + 1;
  });

  res.json({
    totalScored: totalBlocked * 12 + 45, // Simulated total traffic scored ratio
    totalBlocked,
    blocksByType
  });
});

app.listen(PORT, () => {
  console.log(`API Server listening on port ${PORT}`);
});
