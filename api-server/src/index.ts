import express, { Request, Response } from 'express';
import cors from 'cors';
import { pool, runMigrations } from './db';
import { authenticateToken } from './auth';
import loginRouter from './login';

const app = express();
const PORT = process.env.PORT || 5000;
const BUILD_SERVICE_URL = process.env.BUILD_SERVICE_URL || 'http://build-service:5001';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const GATEWAY_PUBLIC_URL = (process.env.GATEWAY_PUBLIC_URL || 'http://localhost:8081').replace(/\/$/, '');
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

app.use(cors({ origin: FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()) }));
app.use(express.json());

// Mount authentication and health endpoints
app.use(loginRouter);

// Authentication middleware for protected endpoints
app.use(authenticateToken);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ service: 'api-server', status: 'ok' });
});

// -------------------- Apps --------------------
// List all apps
app.get('/api/apps', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM apps ORDER BY created_at DESC');
    res.json(rows);
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error fetching apps' });
  }
});

// Get specific app by id
app.get('/api/apps/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM apps WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'App not found' });
    res.json(rows[0]);
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error fetching app' });
  }
});

// Lookup app by subdomain / slug (for Vercel-style domain routing)
app.get('/api/apps/by-domain/:domain', async (req: Request, res: Response) => {
  const domain = req.params.domain;
  const rawDomain = Array.isArray(domain) ? domain[0] : domain;
  const cleanDomain = (rawDomain || '').toLowerCase().trim();
  try {
    const { rows } = await pool.query(
      `SELECT * FROM apps 
       WHERE lower(id) = $1 
          OR lower(name) = $1 
          OR lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) = $1
       ORDER BY created_at DESC LIMIT 1`,
      [cleanDomain]
    );
    if (rows.length === 0) return res.status(404).json({ error: `App with domain '${domain}' not found` });
    res.json(rows[0]);
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error fetching app by domain' });
  }
});

// Delete specific app and associated container
app.delete('/api/apps/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    try {
      await fetch(`${BUILD_SERVICE_URL}/containers/${id}`, {
        method: 'DELETE',
        headers: { 'X-Internal-Service-Token': INTERNAL_SERVICE_TOKEN }
      });
    } catch (bsErr: any) {
      console.warn(`[Build Service Warning] Failed deleting container for ${id}:`, bsErr.message);
    }

    const result = await pool.query('DELETE FROM apps WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: `App '${id}' not found` });
    }

    res.json({ success: true, message: `App '${id}' deleted successfully` });
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error deleting app' });
  }
});

// Bulk delete all apps
app.delete('/api/apps', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT id FROM apps');
    for (const app of rows) {
      try {
        await fetch(`${BUILD_SERVICE_URL}/containers/${app.id}`, {
          method: 'DELETE',
          headers: { 'X-Internal-Service-Token': INTERNAL_SERVICE_TOKEN }
        });
      } catch (_) {}
    }
    await pool.query('DELETE FROM apps');
    res.json({ success: true, message: `Deleted ${rows.length} apps` });
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error clearing apps' });
  }
});

// Register a new app (called by build‑service)
app.post('/api/apps/register', async (req: Request, res: Response) => {
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
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error while registering app' });
  }
});

// Deploy a new app – triggers the build‑service
app.post('/api/apps/deploy', async (req: Request, res: Response) => {
  const { repoUrl, name, envVars } = req.body;
  if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

  const appId = `app-${Date.now().toString(36)}`;
  const appName = name || `App-${appId}`;
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || appId;

  // Pre‑register as building
  try {
    await pool.query(
      `INSERT INTO apps (id, name, repo_url, status, target_url, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [appId, appName, repoUrl, 'building', null]
    );
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    return res.status(500).json({ error: 'Database error while pre‑registering app' });
  }

  try {
    const response = await fetch(`${BUILD_SERVICE_URL}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, appId, name: appName, envVars })
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
    res.status(201).json({
      message: 'Deployment completed successfully',
      app: updatedApp,
      url: `${GATEWAY_PUBLIC_URL}/apps/${encodeURIComponent(appId)}/`,
      domain: `${slug}.localhost:8081`,
      domainUrl: `http://${slug}.localhost:8081/`,
      buildDetails: buildResult
    });
  } catch (err: any) {
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
app.post('/api/logs', async (req: Request, res: Response) => {
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
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error while recording log' });
  }
});

// Retrieve the most recent 200 logs
app.get('/api/logs', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error while fetching logs' });
  }
});

// -------------------- Telemetry & Metrics --------------------
// Increment scored requests count from the gateway
app.post('/api/telemetry/scored', async (req: Request, res: Response) => {
  const increment = Math.max(1, parseInt(req.body?.increment || '1', 10));
  try {
    await pool.query(
      `INSERT INTO system_metrics (key, value)
       VALUES ('requests_scored', $1)
       ON CONFLICT (key) DO UPDATE SET value = system_metrics.value + EXCLUDED.value`,
      [increment]
    );
    res.status(200).json({ success: true, increment });
  } catch (e: any) {
    console.error('[DB Error]', e.message);
    res.status(500).json({ error: 'Database error while recording telemetry' });
  }
});

// Stats endpoint – uses the materialized or standard view 'app_stats' and 'system_metrics'
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM app_stats LIMIT 1');
    const stats = rows[0] || { total_blocked: 0, blocks_by_type: {} };
    const totalBlocked = parseInt(stats.total_blocked || '0', 10);

    let recordedScored = 0;
    try {
      const metricRes = await pool.query(
        "SELECT value FROM system_metrics WHERE key = 'requests_scored' LIMIT 1"
      );
      if (metricRes.rows.length > 0) {
        recordedScored = parseInt(metricRes.rows[0].value || '0', 10);
      }
    } catch {
      // In case table migration has not completed yet
    }

    // Every blocked request had to be inspected and scored by the ML model
    const totalScored = Math.max(recordedScored, totalBlocked);

    res.json({
      totalScored,
      totalBlocked,
      blocksByType: stats.blocks_by_type || {}
    });
  } catch (e: any) {
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

export default app;
