const express = require('express');
const cors = require('cors');
const { pool, runMigrations } = require('./db');
const { authenticateToken } = require('./auth');
const { predict } = require('./predict');
const loginRouter = require('./login');

const app = express();
const PORT = process.env.PORT || 5000;
const BUILD_SERVICE_URL = process.env.BUILD_SERVICE_URL || 'http://build-service:5001';

app.use(cors());
app.use(express.json());

// Mount authentication and health endpoints
app.use(loginRouter);

// Authentication middleware for protected endpoints
app.use(authenticateToken);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ service: 'api-server', status: 'ok' });
});

// Prediction endpoint – uses the scikit‑learn model
app.post('/api/predict', async (req, res) => {
  try {
    const prediction = await predict(req.body);
    res.json({ prediction });
  } catch (e) {
    console.error('[Predict Error]', e);
    res.status(500).json({ error: 'Prediction error', details: e.message });
  }
});

// -------------------- Apps --------------------
// List all apps
app.get('/api/apps', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM apps ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error fetching apps' });
  }
});

// Get specific app by id
app.get('/api/apps/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM apps WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'App not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error fetching app' });
  }
});

// Register a new app (called by build‑service)
app.post('/api/apps/register', async (req, res) => {
  const { id, name, repoUrl, targetUrl, hostPort } = req.body;
  if (!id || !targetUrl) {
    return res.status(400).json({ error: 'id and targetUrl are required' });
  }
  try {
    await pool.query(
      `INSERT INTO apps (id, name, repo_url, status, target_url, host_port, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         repo_url = EXCLUDED.repo_url,
         status = 'running',
         target_url = EXCLUDED.target_url,
         host_port = EXCLUDED.host_port,
         created_at = now();`,
      [id, name || id, repoUrl || null, 'running', targetUrl, hostPort || null]
    );
    res.status(201).json({ message: 'App registered successfully', id, targetUrl });
  } catch (e) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error while registering app' });
  }
});

// Deploy a new app – triggers the build‑service
app.post('/api/apps/deploy', async (req, res) => {
  const { repoUrl, name } = req.body;
  if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

  const appId = `app-${Date.now().toString(36)}`;
  const appName = name || `App-${appId}`;

  // Pre‑register as building
  try {
    await pool.query(
      `INSERT INTO apps (id, name, repo_url, status, target_url, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [appId, appName, repoUrl, 'building', null]
    );
  } catch (e) {
    console.error('[DB Error]', e.message);
    return res.status(500).json({ error: 'Database error while pre‑registering app' });
  }

  try {
    const response = await fetch(`${BUILD_SERVICE_URL}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, appId, name: appName })
    });
    const buildResult = await response.json();

    if (!response.ok) {
      await pool.query(
        `UPDATE apps SET status = $1, error = $2 WHERE id = $3`,
        ['failed', buildResult.error || 'Build failed', appId]
      );
      return res.status(500).json({ error: buildResult.error || 'Build failed' });
    }
    const { rows } = await pool.query('SELECT * FROM apps WHERE id = $1', [appId]);
    const updatedApp = rows[0] || { id: appId, name: appName, status: 'running' };
    res.status(202).json({ message: 'Deployment triggered successfully', app: updatedApp, buildDetails: buildResult });
  } catch (err) {
    console.error('[Build Service Comm Error]', err.message);
    await pool.query(
      `UPDATE apps SET status = $1, error = $2 WHERE id = $3`,
      ['failed', err.message, appId]
    ).catch(() => {});
    res.status(500).json({ error: `Build service communication error: ${err.message}` });
  }
});

// -------------------- Security logs --------------------
// Record a security event from the gateway
app.post('/api/logs', async (req, res) => {
  const { timestamp, clientIp, method, path, attackType, confidence, action } = req.body;
  const id = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  try {
    await pool.query(
      `INSERT INTO security_logs (id, timestamp, client_ip, method, path, attack_type, confidence, action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        timestamp || new Date().toISOString(),
        clientIp || req.ip || '127.0.0.1',
        method || 'GET',
        path || '/',
        attackType || 'Unknown',
        confidence ?? 0.9,
        action || 'BLOCKED'
      ]
    );
    res.status(201).json({ message: 'Log recorded', id });
  } catch (e) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error while recording log' });
  }
});

// Retrieve the most recent 200 logs
app.get('/api/logs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error while fetching logs' });
  }
});

// Stats endpoint – uses the materialized or standard view 'app_stats'
app.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM app_stats LIMIT 1');
    const stats = rows[0] || { total_blocked: 0, blocks_by_type: {} };
    const totalBlocked = parseInt(stats.total_blocked || 0, 10);
    const totalScored = totalBlocked * 12 + 45;
    res.json({
      totalScored,
      totalBlocked,
      blocksByType: stats.blocks_by_type || {}
    });
  } catch (e) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error while computing stats' });
  }
});

// Automatically apply migrations when starting in non-test environments
if (process.env.NODE_ENV !== 'test' && process.env.DATABASE_URL) {
  runMigrations().catch(() => {});
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API Server listening on port ${PORT}`);
  });
}

module.exports = app;
