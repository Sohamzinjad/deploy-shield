import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:5000';
const GATEWAY_BASE = 'http://localhost:8000';

export default function App() {
  const [apps, setApps] = useState([]);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [stats, setStats] = useState({
    totalScored: 0,
    totalBlocked: 0,
    blocksByType: {}
  });

  // Deploy form state
  const [repoUrl, setRepoUrl] = useState('');
  const [appName, setAppName] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState(null);

  // Fetch real telemetry from api-server
  const fetchDashboardData = async () => {
    try {
      const [appsRes, logsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/apps`),
        fetch(`${API_BASE}/api/logs`),
        fetch(`${API_BASE}/api/stats`)
      ]);

      if (appsRes.ok) setApps(await appsRes.json());
      if (logsRes.ok) setSecurityLogs(await logsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Error connecting to API server:', err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleDeploy = async (e) => {
    e.preventDefault();
    if (!repoUrl) return;

    setIsDeploying(true);
    setDeployFeedback({ type: 'info', message: 'Triggering deployment build...' });

    try {
      const res = await fetch(`${API_BASE}/api/apps/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, name: appName || 'My Application' })
      });

      const data = await res.json();
      if (res.ok) {
        setDeployFeedback({
          type: 'success',
          message: `Deployment initiated successfully! App ID: ${data.app.id}`
        });
        setRepoUrl('');
        setAppName('');
        fetchDashboardData();
      } else {
        setDeployFeedback({
          type: 'error',
          message: `Deployment failed: ${data.error}`
        });
      }
    } catch (err) {
      setDeployFeedback({
        type: 'error',
        message: `Network error triggering deploy: ${err.message}`
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const fillSampleApp = () => {
    setRepoUrl('local://sample-app');
    setAppName('Sample Express Service');
  };

  return (
    <div className="dashboard-layout">
      <header>
        <div className="brand">
          🛡️ DeployShield
          <span className="brand-badge">Runtime ML Guard</span>
        </div>
        <div className="status-indicator">
          <span style={{ color: 'var(--accent-success)', fontWeight: 600 }}>
            ● Active Gateway Connected
          </span>
        </div>
      </header>

      <main className="dashboard-grid">
        {/* Top Metric Bar */}
        <div className="card full-width">
          <div className="card-title">Security & ML Runtime Telemetry</div>
          <div className="stats-grid">
            <div className="stat-box">
              <div className="stat-label">Total Requests Evaluated</div>
              <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
                {stats.totalScored}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Blocked Malicious Requests</div>
              <div className="stat-value" style={{ color: 'var(--accent-danger)' }}>
                {stats.totalBlocked}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">SQL Injection Blocks</div>
              <div className="stat-value">{stats.blocksByType.SQLI || stats.blocksByType.SQLi || 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">XSS Attacks Blocked</div>
              <div className="stat-value">{stats.blocksByType.XSS || 0}</div>
            </div>
          </div>
        </div>

        {/* Deploy New App Card */}
        <div className="card full-width">
          <div className="card-title">Deploy Application</div>
          <form onSubmit={handleDeploy} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Git Repository URL or local://sample-app"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              style={{
                flex: 2,
                minWidth: '280px',
                padding: '0.6rem 1rem',
                background: '#0f172a',
                border: '1px solid var(--bg-card-border)',
                color: '#fff',
                borderRadius: '6px'
              }}
              required
            />
            <input
              type="text"
              placeholder="Application Name (optional)"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              style={{
                flex: 1,
                minWidth: '180px',
                padding: '0.6rem 1rem',
                background: '#0f172a',
                border: '1px solid var(--bg-card-border)',
                color: '#fff',
                borderRadius: '6px'
              }}
            />
            <button
              type="submit"
              disabled={isDeploying}
              style={{
                padding: '0.6rem 1.2rem',
                background: 'linear-gradient(135deg, #6366f1, #38bdf8)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {isDeploying ? 'Deploying...' : 'Deploy App'}
            </button>
            <button
              type="button"
              onClick={fillSampleApp}
              style={{
                padding: '0.6rem 1rem',
                background: 'transparent',
                border: '1px solid var(--accent-blue)',
                color: 'var(--accent-blue)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Use Sample App
            </button>
          </form>

          {deployFeedback && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                background: deployFeedback.type === 'error' ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)',
                color: deployFeedback.type === 'error' ? 'var(--accent-danger)' : 'var(--accent-success)',
                border: `1px solid ${deployFeedback.type === 'error' ? 'var(--accent-danger)' : 'var(--accent-success)'}`
              }}
            >
              {deployFeedback.message}
            </div>
          )}
        </div>

        {/* Deployed Apps Table */}
        <div className="card">
          <div className="card-title">
            Deployed Apps Registry ({apps.length})
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>App ID</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Gateway Gateway URL</th>
                </tr>
              </thead>
              <tbody>
                {apps.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No applications deployed yet
                    </td>
                  </tr>
                ) : (
                  apps.map((app) => (
                    <tr key={app.id}>
                      <td className="code-font">{app.id}</td>
                      <td>{app.name}</td>
                      <td>
                        <span className={`badge ${app.status === 'running' ? 'badge-running' : 'badge-blocked'}`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="code-font">
                        <a
                          href={`${GATEWAY_BASE}/apps/${app.id}/`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}
                        >
                          /apps/{app.id}/
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Security Threat Stream */}
        <div className="card">
          <div className="card-title">
            Live Blocked Threat Logs ({securityLogs.length})
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Attack Type</th>
                  <th>Target Path</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {securityLogs.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No threat activity recorded yet. Send malicious traffic to trigger blocks!
                    </td>
                  </tr>
                ) : (
                  securityLogs.map((evt) => (
                    <tr key={evt.id}>
                      <td className="code-font" style={{ fontSize: '0.8rem' }}>
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--accent-warning)' }}>
                          {evt.attackType}
                        </span>{' '}
                        ({(evt.confidence * 100).toFixed(0)}%)
                      </td>
                      <td
                        className="code-font"
                        style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {evt.path}
                      </td>
                      <td>
                        <span className="badge badge-blocked">{evt.action}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
