import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from './context/AuthContext';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  User,
  Activity,
  LogOut,
  Send,
  ExternalLink,
  Database,
  Code2,
  Terminal,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  Search,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:5000';
const GATEWAY_BASE = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8000';

export default function App() {
  const { token, login, logout } = useContext(AuthContext);

  const [apps, setApps] = useState([]);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [stats, setStats] = useState({
    totalScored: 0,
    totalBlocked: 0,
    blocksByType: {}
  });

  // Login form state
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Deploy form state
  const [repoUrl, setRepoUrl] = useState('');
  const [appName, setAppName] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState(null);

  // Security controls state
  const [sensitivity, setSensitivity] = useState(0.8);
  const [testPayload, setTestPayload] = useState('GET /apps/sample-app-1/search?q=UNION SELECT 1,2,3');
  const [testResult, setTestResult] = useState(null);

  // UI Filter states
  const [appSearch, setAppSearch] = useState('');
  const [logFilter, setLogFilter] = useState('ALL');

  // Fetch real telemetry from api-server
  const fetchDashboardData = async () => {
    if (!token) return;
    try {
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const [appsRes, logsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/apps`, { headers }),
        fetch(`${API_BASE}/api/logs`, { headers }),
        fetch(`${API_BASE}/api/stats`, { headers })
      ]);

      if (appsRes.status === 401 || appsRes.status === 403) {
        logout();
        return;
      }

      if (appsRes.ok) setApps(await appsRes.json());
      if (logsRes.ok) setSecurityLogs(await logsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Error connecting to API server:', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 3000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        login(data.token);
      } else {
        setLoginError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setLoginError(`Connection error: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSensitivityChange = async (newVal) => {
    setSensitivity(newVal);
    try {
      await fetch(`${GATEWAY_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: newVal })
      });
    } catch (err) {
      console.error('Error updating gateway sensitivity:', err);
    }
  };

  const runTestPayload = async () => {
    setTestResult({ status: 'testing', message: 'Routing payload through DeployShield ML Gateway...' });
    try {
      const trimmed = testPayload.trim();
      const parts = trimmed.split(/\s+/);
      let method = 'GET';
      let pathAndQuery = trimmed;

      if (['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(parts[0].toUpperCase())) {
        method = parts[0].toUpperCase();
        pathAndQuery = parts.slice(1).join(' ');
      }

      const urlPath = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
      const targetUrl = `${GATEWAY_BASE}${encodeURI(urlPath)}`;

      const res = await fetch(targetUrl, { method });
      const data = await res.json().catch(() => ({}));

      if (res.status === 403) {
        setTestResult({
          status: 'blocked',
          title: 'BLOCKED BY RUNTIME ML WAF',
          threat: data.threatDetected || 'MALICIOUS ATTACK',
          confidence: data.confidenceScore ? `${(data.confidenceScore * 100).toFixed(1)}%` : 'HIGH'
        });
      } else {
        setTestResult({
          status: 'allowed',
          title: 'ALLOWED (BENIGN REQUEST)',
          statusCode: res.status
        });
      }
      fetchDashboardData();
    } catch (err) {
      setTestResult({ status: 'error', message: `Test connection error: ${err.message}` });
    }
  };

  const handleDeploy = async (e) => {
    e.preventDefault();
    if (!repoUrl) return;

    setIsDeploying(true);
    setDeployFeedback({ type: 'info', message: 'Triggering container build pipeline...' });

    try {
      const res = await fetch(`${API_BASE}/api/apps/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ repoUrl, name: appName || 'My Application' })
      });

      const data = await res.json();
      if (res.ok) {
        setDeployFeedback({
          type: 'success',
          message: `Deployment initiated! App ID: ${data.app?.id || data.appId || 'New App'}`
        });
        setRepoUrl('');
        setAppName('');
        fetchDashboardData();
      } else {
        setDeployFeedback({
          type: 'error',
          message: `Deployment failed: ${data.error || 'Unknown error'}`
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
    setAppName('Sample Express Microservice');
  };

  const filteredApps = apps.filter(a => 
    (a.name && a.name.toLowerCase().includes(appSearch.toLowerCase())) ||
    (a.id && a.id.toLowerCase().includes(appSearch.toLowerCase()))
  );

  const filteredLogs = securityLogs.filter(log => {
    if (logFilter === 'ALL') return true;
    const type = (log.attack_type || log.attackType || '').toUpperCase();
    return type.includes(logFilter);
  });

  // ==========================================
  // LOGIN SCREEN (Tailwind CSS)
  // ==========================================
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#060913]">
        {/* Glow backdrop shapes */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md glass-card rounded-2xl p-8 shadow-2xl relative z-10 border border-white/10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 text-white shadow-lg shadow-cyan-500/25 mb-4">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">DeployShield</h1>
            <p className="text-sm text-slate-400 mt-1">Autonomous AI Security & Cloud Deployment</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder="admin"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-white/10 rounded-lg text-white placeholder-slate-600 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="password123"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-white/10 rounded-lg text-white placeholder-slate-600 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition transform active:scale-[0.99] disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In to Dashboard'
              )}
            </button>

            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
              <span>Demo Credentials:</span>
              <button
                type="button"
                onClick={() => { setLoginUsername('admin'); setLoginPassword('password123'); }}
                className="text-cyan-400 hover:underline font-mono"
              >
                admin / password123 (Autofill)
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // DASHBOARD MAIN VIEW (Tailwind CSS)
  // ==========================================
  return (
    <div className="min-h-screen flex flex-col bg-[#060913] text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-white/10 px-6 py-3.5 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg text-white tracking-tight">DeployShield</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              AI Security WAF
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>AI Gateway Active (99.9%)</span>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
              A
            </div>
            <span className="text-xs text-slate-300 font-medium hidden md:inline">Admin</span>
            <button
              onClick={logout}
              title="Sign Out"
              className="ml-1 p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/30 transition flex items-center gap-1.5 text-xs font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 */}
          <div className="glass-card glass-card-interactive rounded-xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Requests Evaluated</p>
                <h3 className="text-2xl font-extrabold font-mono text-cyan-400 mt-1">
                  {stats.totalScored || 0}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Activity className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
              <span className="text-emerald-400 font-semibold">● Real-time</span>
              <span>traffic telemetry</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="glass-card glass-card-interactive rounded-xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Blocked Threats</p>
                <h3 className="text-2xl font-extrabold font-mono text-rose-400 mt-1">
                  {stats.totalBlocked || 0}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
              <span className="text-rose-400 font-semibold">
                {stats.totalScored ? `${((stats.totalBlocked / stats.totalScored) * 100).toFixed(1)}%` : '0%'}
              </span>
              <span>threat intercept rate</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="glass-card glass-card-interactive rounded-xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">SQL Injection Blocks</p>
                <h3 className="text-2xl font-extrabold font-mono text-amber-400 mt-1">
                  {stats.blocksByType?.SQLI || stats.blocksByType?.SQLi || 0}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Database className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-400">Database protection active</div>
          </div>

          {/* Card 4 */}
          <div className="glass-card glass-card-interactive rounded-xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">XSS Attacks Blocked</p>
                <h3 className="text-2xl font-extrabold font-mono text-indigo-400 mt-1">
                  {stats.blocksByType?.XSS || 0}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Code2 className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-400">Frontend injection defense</div>
          </div>
        </div>

        {/* Security Controls & Live Simulator */}
        <div className="glass-card rounded-xl p-6 border-cyan-500/30 shadow-glow-cyan">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-cyan-400">
              <Zap className="w-5 h-5" />
              <h2 className="font-bold text-base text-white">AI Sensitivity & Live Threat Simulator</h2>
            </div>
            <span className="text-xs text-slate-400">Runtime ML Inference Layer</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Slider */}
            <div className="bg-slate-950/60 rounded-xl p-4 border border-white/5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-300">Protection Strictness Threshold:</span>
                  <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-mono font-bold text-sm">
                    {(sensitivity * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={sensitivity}
                  onChange={(e) => handleSensitivityChange(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className={`px-2 py-1 rounded border font-medium ${
                  sensitivity <= 0.65 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                  sensitivity >= 0.85 ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                  'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  {sensitivity <= 0.65 ? '🟢 Relaxed Mode (Low False Positives)' :
                   sensitivity >= 0.85 ? '🔴 Paranoid Mode (Max Strictness)' :
                   '🟡 Balanced Mode (Recommended)'}
                </span>
                <span className="text-slate-500 font-mono text-[11px]">Threshold: {sensitivity}</span>
              </div>
            </div>

            {/* Right: Attack Simulator */}
            <div className="bg-slate-950/60 rounded-xl p-4 border border-white/5 space-y-3">
              <span className="text-sm font-semibold text-slate-300 block">Instant Threat Injection:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testPayload}
                  onChange={(e) => setTestPayload(e.target.value)}
                  className="flex-1 px-3 py-2 bg-black/80 border border-white/10 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={runTestPayload}
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold rounded-lg shadow-md shadow-rose-600/30 transition flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  Test WAF
                </button>
              </div>

              {/* Presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-slate-500">Presets:</span>
                <button
                  onClick={() => setTestPayload('GET /apps/sample-app-1/search?q=UNION SELECT 1,2,3')}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-cyan-500/15 border border-white/10 hover:border-cyan-500/40 text-[11px] font-mono text-slate-300 hover:text-cyan-400 transition"
                >
                  SQLi
                </button>
                <button
                  onClick={() => setTestPayload('GET /apps/sample-app-1/?user=<script>alert(1)</script>')}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-cyan-500/15 border border-white/10 hover:border-cyan-500/40 text-[11px] font-mono text-slate-300 hover:text-cyan-400 transition"
                >
                  XSS
                </button>
                <button
                  onClick={() => setTestPayload('GET /apps/sample-app-1/exec?cmd=cat /etc/passwd')}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-cyan-500/15 border border-white/10 hover:border-cyan-500/40 text-[11px] font-mono text-slate-300 hover:text-cyan-400 transition"
                >
                  Cmd Injection
                </button>
                <button
                  onClick={() => setTestPayload('GET /apps/sample-app-1/api/products?category=shoes')}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-500/40 text-[11px] font-mono text-slate-300 hover:text-emerald-400 transition"
                >
                  Benign GET
                </button>
              </div>

              {/* Result card */}
              {testResult && (
                <div className={`p-3 rounded-lg border text-xs flex items-center justify-between transition ${
                  testResult.status === 'blocked' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
                  testResult.status === 'allowed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                  'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {testResult.status === 'blocked' && <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />}
                    {testResult.status === 'allowed' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {testResult.status === 'testing' && <RefreshCw className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />}
                    <span>
                      <strong>{testResult.title || testResult.message}</strong>{' '}
                      {testResult.threat ? `— Attack: ${testResult.threat} (${testResult.confidence})` : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deploy New Application Card */}
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-2 text-indigo-400 mb-4">
            <Server className="w-5 h-5" />
            <h2 className="font-bold text-base text-white">Deploy Microservice / Web App</h2>
          </div>

          <form onSubmit={handleDeploy} className="flex flex-col sm:flex-row gap-3 items-stretch">
            <input
              type="text"
              placeholder="Git Repository URL (e.g. local://sample-app or https://github.com/...)"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              required
              className="flex-2 px-4 py-2.5 bg-slate-950/80 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 transition"
            />
            <input
              type="text"
              placeholder="App Name (optional)"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-950/80 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 transition"
            />
            <button
              type="submit"
              disabled={isDeploying}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition text-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            >
              {isDeploying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Building & Launching...
                </>
              ) : (
                'Deploy App'
              )}
            </button>
            <button
              type="button"
              onClick={fillSampleApp}
              className="px-4 py-2.5 border border-white/15 hover:border-cyan-400/40 text-slate-300 hover:text-cyan-400 rounded-lg text-xs font-semibold transition shrink-0"
            >
              Load Sample App
            </button>
          </form>

          {deployFeedback && (
            <div className={`mt-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
              deployFeedback.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}>
              {deployFeedback.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{deployFeedback.message}</span>
            </div>
          )}
        </div>

        {/* Split Grid: Apps Table & Security Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Deployed Apps */}
          <div className="glass-card rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-white text-base">Deployed Apps ({apps.length})</h3>
                </div>
                <div className="relative w-40">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search apps..."
                    value={appSearch}
                    onChange={(e) => setAppSearch(e.target.value)}
                    className="w-full pl-8 pr-2 py-1 bg-black/60 border border-white/10 rounded-md text-xs text-slate-200 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider">
                      <th className="pb-2">App ID</th>
                      <th className="pb-2">Name</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Gateway Proxy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredApps.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          No deployed applications found.
                        </td>
                      </tr>
                    ) : (
                      filteredApps.map((app) => (
                        <tr key={app.id} className="hover:bg-white/[0.02] transition">
                          <td className="py-3 font-mono text-cyan-400">{app.id}</td>
                          <td className="py-3 font-medium text-slate-200">{app.name}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              app.status === 'running'
                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                                : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                            }`}>
                              {app.status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <a
                              href={`${GATEWAY_BASE}/apps/${app.id}/`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-indigo-400 hover:text-cyan-300 underline"
                            >
                              /apps/{app.id}/
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Security Threat Stream */}
          <div className="glass-card rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-white text-base">Security Threat Logs ({securityLogs.length})</h3>
                </div>
                <div className="flex gap-1 text-[11px]">
                  {['ALL', 'SQLI', 'XSS', 'CMD'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setLogFilter(filter)}
                      className={`px-2 py-0.5 rounded transition ${
                        logFilter === filter
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto max-h-[320px] overflow-y-auto pr-1">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider sticky top-0 bg-[#0c1222]">
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Threat</th>
                      <th className="pb-2">Path</th>
                      <th className="pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No threats recorded yet. Run the attack simulator above!
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((evt) => (
                        <tr key={evt.id} className="hover:bg-white/[0.02] transition">
                          <td className="py-2.5 font-mono text-[11px] text-slate-400">
                            {new Date(evt.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5">
                            <span className="font-semibold text-amber-400">
                              {evt.attack_type || evt.attackType || 'THREAT'}
                            </span>{' '}
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({((evt.confidence ?? 0.9) * 100).toFixed(0)}%)
                            </span>
                          </td>
                          <td className="py-2.5 font-mono text-slate-300 max-w-[140px] truncate" title={evt.path}>
                            {evt.path}
                          </td>
                          <td className="py-2.5 text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-500/15 border border-rose-500/30 text-rose-400">
                              {evt.action || 'BLOCKED'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
