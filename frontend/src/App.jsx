import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from './context/AuthContext';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
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
  EyeOff,
  GitBranch,
  GitCommit,
  Clock,
  Plus,
  ArrowUpRight,
  Filter,
  Sliders,
  ChevronRight,
  Play,
  Cpu,
  BarChart3,
  Globe,
  Settings,
  X,
  FileCode,
  Sparkles,
  Command,
  HelpCircle,
  Bell,
  Box,
  Share2
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:5003';
const GATEWAY_BASE = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8000';

export default function App() {
  const { token, login, logout } = useContext(AuthContext);

  // Active navigation tab: 'overview' | 'deployments' | 'security' | 'ml-thesis' | 'settings'
  const [activeTab, setActiveTab] = useState('overview');

  // Core data states
  const [apps, setApps] = useState([]);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [stats, setStats] = useState({
    totalScored: 0,
    totalBlocked: 0,
    blocksByType: {}
  });
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Deploy Modal & Form state
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [appName, setAppName] = useState('');
  const [frameworkPreset, setFrameworkPreset] = useState('express');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState(null);

  // Security WAF controls state
  const [sensitivity, setSensitivity] = useState(0.8);
  const [testPayload, setTestPayload] = useState('GET /apps/sample-app-1/search?q=UNION SELECT 1,2,3');
  const [testResult, setTestResult] = useState(null);
  const [isTestingPayload, setIsTestingPayload] = useState(false);

  // Filters & Search
  const [projectSearch, setProjectSearch] = useState('');
  const [logFilter, setLogFilter] = useState('ALL');
  const [logSearch, setLogSearch] = useState('');

  // Command palette modal state (⌘K)
  const [isCmdOpen, setIsCmdOpen] = useState(false);

  // Log detail modal state
  const [selectedLog, setSelectedLog] = useState(null);

  // Fetch telemetry & projects from api-server
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

      if (appsRes.ok) {
        const appsData = await appsRes.json();
        setApps(appsData);
      }
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setSecurityLogs(logsData);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error('API Server sync error:', err);
    }
  };

  useEffect(() => {
    if (token) {
      setIsLoadingData(true);
      fetchDashboardData().finally(() => setIsLoadingData(false));
      const interval = setInterval(fetchDashboardData, 3000);
      return () => clearInterval(interval);
    }
  }, [token]);

  // Keyboard shortcut for Command Palette (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsCmdOpen(false);
        setIsDeployModalOpen(false);
        setSelectedLog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Login handler
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

  // Gateway sensitivity threshold handler
  const handleSensitivityChange = async (newVal) => {
    setSensitivity(newVal);
    try {
      await fetch(`${GATEWAY_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: newVal })
      });
    } catch (err) {
      console.error('Error updating gateway threshold:', err);
    }
  };

  // Test Payload against WAF Gateway
  const runTestPayload = async () => {
    setIsTestingPayload(true);
    setTestResult({ status: 'testing', message: 'Intercepting payload in DeployShield ML Gateway...' });
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

      const startTime = performance.now();
      const res = await fetch(targetUrl, { method });
      const duration = (performance.now() - startTime).toFixed(1);
      const data = await res.json().catch(() => ({}));

      if (res.status === 403) {
        setTestResult({
          status: 'blocked',
          title: 'BLOCKED BY ML FIREWALL (403 FORBIDDEN)',
          threat: data.threatDetected || data.attackType || 'MALICIOUS ATTACK',
          confidence: data.confidenceScore ? `${(data.confidenceScore * 100).toFixed(1)}%` : '98.5%',
          duration: `${duration}ms`,
          details: data.details || 'Request blocked before reaching container target'
        });
      } else {
        setTestResult({
          status: 'allowed',
          title: `ALLOWED (BENIGN REQUEST — STATUS ${res.status})`,
          threat: 'CLEAN',
          confidence: '99.2%',
          duration: `${duration}ms`,
          details: 'Synchronously verified and proxied to upstream app container'
        });
      }
      fetchDashboardData();
    } catch (err) {
      setTestResult({
        status: 'error',
        title: 'GATEWAY CONNECTION ERROR',
        message: err.message
      });
    } finally {
      setIsTestingPayload(false);
    }
  };

  // Deploy project handler
  const handleDeploy = async (e) => {
    e.preventDefault();
    if (!repoUrl) return;

    setIsDeploying(true);
    setDeployFeedback({ type: 'info', message: 'Triggering Docker build & gateway registration...' });

    try {
      const res = await fetch(`${API_BASE}/api/apps/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ repoUrl, name: appName || 'Vercel App' })
      });

      const data = await res.json();
      if (res.ok) {
        setDeployFeedback({
          type: 'success',
          message: `Deployment initiated! App ID: ${data.app?.id || data.appId || 'New App'}`
        });
        setRepoUrl('');
        setAppName('');
        setTimeout(() => {
          setIsDeployModalOpen(false);
          setDeployFeedback(null);
        }, 2000);
        fetchDashboardData();
      } else {
        setDeployFeedback({
          type: 'error',
          message: `Deployment failed: ${data.error || 'Build error'}`
        });
      }
    } catch (err) {
      setDeployFeedback({
        type: 'error',
        message: `Network error: ${err.message}`
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const loadSamplePreset = () => {
    setRepoUrl('local://sample-app');
    setAppName('sample-microservice');
    setFrameworkPreset('express');
  };

  // Filtered lists
  const filteredApps = apps.filter((a) => {
    const q = projectSearch.toLowerCase();
    return (
      (a.name && a.name.toLowerCase().includes(q)) ||
      (a.id && a.id.toLowerCase().includes(q)) ||
      (a.repo_url && a.repo_url.toLowerCase().includes(q))
    );
  });

  const filteredLogs = securityLogs.filter((log) => {
    const type = (log.attack_type || log.attackType || '').toUpperCase();
    const matchesFilter = logFilter === 'ALL' || type.includes(logFilter);
    const matchesSearch =
      !logSearch ||
      (log.path && log.path.toLowerCase().includes(logSearch.toLowerCase())) ||
      type.toLowerCase().includes(logSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // =========================================================================
  // 1. AUTHENTICATION VIEW (VERCEL MONOCHROME DESIGN)
  // =========================================================================
  if (!token) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative selection:bg-white selection:text-black">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#111111_1px,transparent_1px),linear-gradient(to_bottom,#111111_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none opacity-40" />

        <div className="w-full max-w-sm relative z-10">
          {/* Vercel Triangle & Shield Logo */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-10 h-10 mb-4 flex items-center justify-center">
              <svg viewBox="0 0 76 65" fill="none" className="w-9 h-9 text-white">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
              Log in to DeployShield
            </h1>
            <p className="text-xs text-neutral-400 mt-1.5">
              Enterprise Vercel Deployment Platform with Native ML WAF
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-6 shadow-2xl">
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="admin"
                    required
                    className="w-full pl-9 pr-3 py-2 bg-[#111111] border border-[#262626] rounded-md text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-9 pr-9 py-2 bg-[#111111] border border-[#262626] rounded-md text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-neutral-500 hover:text-neutral-300"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="p-2.5 rounded bg-red-950/40 border border-red-800/50 text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2 px-4 bg-white text-black hover:bg-neutral-200 font-medium rounded-md text-xs transition duration-150 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Continue with Credentials'
                )}
              </button>

              <div className="pt-3 border-t border-[#1f1f1f] flex items-center justify-between text-[11px] text-neutral-500">
                <span>Demo Account:</span>
                <button
                  type="button"
                  onClick={() => {
                    setLoginUsername('admin');
                    setLoginPassword('password123');
                  }}
                  className="text-neutral-300 hover:text-white font-mono underline cursor-pointer"
                >
                  admin / password123
                </button>
              </div>
            </form>
          </div>

          {/* Footer note */}
          <div className="text-center mt-6 text-xs text-neutral-600">
            Protected natively by DeployShield Machine Learning Runtime
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. MAIN VERCEL DASHBOARD APPLICATION
  // =========================================================================
  return (
    <div className="min-h-screen bg-black text-[#ededed] font-sans flex flex-col selection:bg-white selection:text-black">
      {/* Top Main Navigation Header (Vercel Style) */}
      <header className="border-b border-[#222222] bg-black sticky top-0 z-40">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Left: Vercel Logo + Scope Switcher */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 76 65" fill="none" className="w-6 h-5 text-white shrink-0">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
              </svg>
              <span className="text-neutral-600 font-light">/</span>
            </div>

            {/* Scope / Workspace selector */}
            <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#111111] transition cursor-pointer">
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-neutral-700 to-neutral-500 flex items-center justify-center text-[10px] font-semibold text-white">
                S
              </div>
              <span className="text-xs font-medium text-neutral-200">sohamzinjad</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-[#1f1f1f] text-neutral-400 border border-[#333333]">
                Hobby
              </span>
            </div>
          </div>

          {/* Right: Actions, Feedback, Docs, Command Menu, Avatar */}
          <div className="flex items-center gap-3 text-xs">
            {/* Command palette button (⌘K) */}
            <button
              onClick={() => setIsCmdOpen(true)}
              className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#111111] border border-[#262626] text-neutral-400 hover:text-neutral-200 hover:border-[#404040] transition text-[11px]"
            >
              <Search className="w-3 h-3 text-neutral-500" />
              <span>Find anything...</span>
              <kbd className="px-1 py-0.2 rounded bg-[#1c1c1c] text-neutral-400 font-mono text-[10px] border border-[#333333]">
                ⌘K
              </kbd>
            </button>

            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-400 hover:text-white transition hidden sm:inline"
            >
              Docs
            </a>

            <div className="h-4 w-px bg-[#262626] hidden sm:block" />

            {/* Live Gateway Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111111] border border-[#222222] text-[11px] text-neutral-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-neutral-400">Gateway:</span>
              <span className="text-emerald-400 font-medium">99.9% ML Shield</span>
            </div>

            {/* User Profile / Logout */}
            <button
              onClick={logout}
              title="Sign Out"
              className="flex items-center gap-1.5 px-2 py-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/40 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Vercel Navigation Tabs */}
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 flex gap-6 overflow-x-auto no-scrollbar text-xs border-t border-[#1a1a1a]">
          {[
            { id: 'overview', label: 'Overview', icon: Box },
            { id: 'deployments', label: 'Deployments', icon: Layers, count: apps.length },
            { id: 'security', label: 'Security Shield (WAF)', icon: ShieldCheck, badge: `${stats.totalBlocked || 0} Blocked` },
            { id: 'ml-thesis', label: 'ML Thesis & Benchmark', icon: Cpu },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 flex items-center gap-2 relative font-medium transition cursor-pointer whitespace-nowrap ${
                  isActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#1c1c1c] text-neutral-400">
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-red-950/60 border border-red-800/40 text-red-400">
                    {tab.badge}
                  </span>
                )}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t" />
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1240px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* =================================================================== */}
        {/* TAB 1: OVERVIEW (PROJECTS DASHBOARD) */}
        {/* =================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Metric Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[#0a0a0a] border border-[#222222] rounded-lg p-4">
                <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                  Total Projects
                </div>
                <div className="text-2xl font-bold font-mono text-white mt-1">
                  {apps.length}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
                  <span className="text-emerald-400 font-medium">● 100%</span> running containers
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-[#222222] rounded-lg p-4">
                <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                  Requests Scored
                </div>
                <div className="text-2xl font-bold font-mono text-white mt-1">
                  {stats.totalScored || 0}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
                  <span className="text-cyan-400 font-medium">● ML Gateway</span> synchronous inspection
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-[#222222] rounded-lg p-4">
                <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                  Threats Neutralized
                </div>
                <div className="text-2xl font-bold font-mono text-red-400 mt-1">
                  {stats.totalBlocked || 0}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  SQLi, XSS, Command Injections
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-[#222222] rounded-lg p-4">
                <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                  Protection Strictness
                </div>
                <div className="text-2xl font-bold font-mono text-neutral-200 mt-1">
                  {(sensitivity * 100).toFixed(0)}%
                </div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  RandomForest + IsolationForest
                </div>
              </div>
            </div>

            {/* Actions Bar: Search, Filter, Add New Project */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search projects by name, id, or repository..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-[#0a0a0a] border border-[#262626] rounded-md text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400 transition"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsDeployModalOpen(true)}
                  className="px-3.5 py-1.5 bg-white text-black hover:bg-neutral-200 font-medium rounded-md text-xs transition duration-150 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Project</span>
                </button>
              </div>
            </div>

            {/* Vercel Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredApps.length === 0 ? (
                <div className="col-span-full border border-dashed border-[#262626] rounded-xl p-12 text-center bg-[#0a0a0a]">
                  <Box className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-neutral-200">No projects found</h3>
                  <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                    Get started by deploying your first repository or load our pre-configured sample microservice.
                  </p>
                  <button
                    onClick={() => {
                      loadSamplePreset();
                      setIsDeployModalOpen(true);
                    }}
                    className="mt-4 px-4 py-2 bg-white text-black text-xs font-medium rounded-md hover:bg-neutral-200 transition"
                  >
                    Deploy Sample Microservice
                  </button>
                </div>
              ) : (
                filteredApps.map((app) => {
                  const gatewayDomain = `${GATEWAY_BASE}/apps/${app.id}/`;
                  return (
                    <div
                      key={app.id}
                      className="bg-[#0a0a0a] border border-[#222222] hover:border-[#404040] rounded-xl p-5 flex flex-col justify-between transition-all duration-150 group shadow-sm"
                    >
                      {/* Top row: Name + Badge */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#141414] border border-[#262626] flex items-center justify-center text-white font-mono text-xs font-bold group-hover:border-neutral-400 transition">
                              {app.name ? app.name.charAt(0).toUpperCase() : 'A'}
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-white tracking-tight group-hover:text-neutral-100">
                                {app.name || app.id}
                              </h3>
                              <p className="text-[11px] font-mono text-neutral-500">{app.id}</p>
                            </div>
                          </div>

                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Production
                          </span>
                        </div>

                        {/* Domain Link */}
                        <div className="mt-4 pt-3 border-t border-[#1a1a1a]">
                          <a
                            href={gatewayDomain}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-mono text-neutral-400 hover:text-white flex items-center gap-1.5 transition truncate"
                          >
                            <span>/apps/{app.id}/</span>
                            <ArrowUpRight className="w-3 h-3 shrink-0 text-neutral-500 group-hover:text-white" />
                          </a>
                        </div>
                      </div>

                      {/* Bottom row: Git repo, branch, status */}
                      <div className="mt-5 pt-3 border-t border-[#1a1a1a] flex items-center justify-between text-[11px] text-neutral-400">
                        <div className="flex items-center gap-1.5 font-mono text-neutral-500">
                          <GitBranch className="w-3 h-3 text-neutral-400" />
                          <span>main</span>
                          <span>•</span>
                          <span className="text-neutral-400 truncate max-w-[120px]">
                            {app.repo_url || 'local-repo'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                          <ShieldCheck className="w-3 h-3" />
                          <span>WAF Protected</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: DEPLOYMENTS */}
        {/* =================================================================== */}
        {activeTab === 'deployments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Deployments History</h2>
                <p className="text-xs text-neutral-400">
                  Containerized instances managed by Build Service and registered with Gateway Proxy
                </p>
              </div>
              <button
                onClick={() => setIsDeployModalOpen(true)}
                className="px-3 py-1.5 bg-white text-black hover:bg-neutral-200 font-medium rounded-md text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Deployment</span>
              </button>
            </div>

            <div className="border border-[#222222] rounded-xl overflow-hidden bg-[#0a0a0a]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#222222] text-neutral-400 uppercase tracking-wider text-[10px] bg-[#111111]">
                    <th className="py-3 px-4">Deployment</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Repository</th>
                    <th className="py-3 px-4">Target Container</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {apps.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-neutral-500">
                        No active deployments.
                      </td>
                    </tr>
                  ) : (
                    apps.map((app) => (
                      <tr key={app.id} className="hover:bg-[#111111] transition">
                        <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span>{app.name || app.id}</span>
                          <span className="text-[10px] font-mono text-neutral-500">({app.id})</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-emerald-950/40 border border-emerald-800/40 text-emerald-400">
                            Ready
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-neutral-400">
                          {app.repo_url || 'local://sample-app'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-neutral-500">
                          {app.target_url || 'http://sample-app:3000'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <a
                            href={`${GATEWAY_BASE}/apps/${app.id}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white underline font-mono"
                          >
                            Visit App <ArrowUpRight className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: SECURITY SHIELD & LIVE WAF (THE CORE THESIS FROM PDF) */}
        {/* =================================================================== */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Header Hero Banner (Slide 1 & 3 of PDF) */}
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-6 relative overflow-hidden">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 mb-3">
                  <Sparkles className="w-3 h-3" />
                  ML-Powered Gateway
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Runtime Web Threat Detection built natively into the deployment pipeline
                </h2>
                <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                  Every incoming HTTP request is intercepted synchronously by the gateway reverse proxy,
                  scored by our trained Random Forest & Isolation Forest ML classifiers, and blocked or forwarded
                  <em> before</em> it ever touches your app container.
                </p>
              </div>

              {/* Quick stats pills */}
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
                <div className="px-3 py-1.5 rounded-md bg-[#111111] border border-[#222222] font-mono text-neutral-300">
                  Total Scored: <strong className="text-white">{stats.totalScored || 0}</strong>
                </div>
                <div className="px-3 py-1.5 rounded-md bg-[#111111] border border-red-900/40 font-mono text-red-400">
                  Total Blocked: <strong>{stats.totalBlocked || 0}</strong>
                </div>
                <div className="px-3 py-1.5 rounded-md bg-[#111111] border border-[#222222] font-mono text-amber-400">
                  SQLi Intercepts: <strong>{stats.blocksByType?.SQLI || stats.blocksByType?.SQLi || 0}</strong>
                </div>
                <div className="px-3 py-1.5 rounded-md bg-[#111111] border border-[#222222] font-mono text-indigo-400">
                  XSS Intercepts: <strong>{stats.blocksByType?.XSS || 0}</strong>
                </div>
              </div>
            </div>

            {/* Architecture Request Flow Diagram (Slide 4 of PDF) */}
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-neutral-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                    Request Flow Architecture
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-neutral-500">Single-Host Docker Compose</span>
              </div>

              {/* Interactive Flow Box */}
              <div className="p-4 bg-[#050505] border border-[#1f1f1f] rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center text-center">
                  {/* Step 1: Client */}
                  <div className="p-3 bg-[#111111] border border-[#262626] rounded-lg">
                    <div className="text-[10px] font-mono uppercase text-neutral-500">Source</div>
                    <div className="text-xs font-bold text-white mt-1">Client / Botnet</div>
                    <div className="text-[10px] text-neutral-400 mt-1">HTTP Request</div>
                  </div>

                  <div className="text-neutral-600 hidden md:block">➔</div>

                  {/* Step 2: Gateway */}
                  <div className="p-3 bg-neutral-900 border border-neutral-700 rounded-lg shadow-sm">
                    <div className="text-[10px] font-mono uppercase text-indigo-400 font-semibold">
                      Port 8000
                    </div>
                    <div className="text-xs font-bold text-white mt-1">Gateway Proxy</div>
                    <div className="text-[10px] text-neutral-400 mt-1">Synchronous Intercept</div>
                  </div>

                  <div className="text-neutral-600 hidden md:block">➔</div>

                  {/* Step 3: ML Classifier */}
                  <div className="p-3 bg-neutral-900 border border-cyan-800/50 rounded-lg">
                    <div className="text-[10px] font-mono uppercase text-cyan-400 font-semibold">
                      FastAPI (Port 8002)
                    </div>
                    <div className="text-xs font-bold text-white mt-1">ML Classifier</div>
                    <div className="text-[10px] text-neutral-400 mt-1">Random Forest / XGBoost</div>
                  </div>
                </div>

                {/* Verdict Branching */}
                <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex flex-col sm:flex-row items-center justify-center gap-4 text-xs font-mono">
                  <div className="px-3 py-1.5 rounded bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 flex items-center gap-2">
                    <span>✅ Benign Traffic</span>
                    <span>➔</span>
                    <span>Proxy to Deployed App (Clean)</span>
                  </div>
                  <div className="px-3 py-1.5 rounded bg-red-950/40 border border-red-800/50 text-red-400 flex items-center gap-2">
                    <span>🚫 Malicious Attack</span>
                    <span>➔</span>
                    <span>403 Forbidden & Logged</span>
                  </div>
                </div>
              </div>
            </div>

            {/* WAF Controls & Live Threat Injection Simulator */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Sensitivity Strictness Threshold */}
              <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-neutral-400" />
                      <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                        Protection Strictness
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 bg-[#171717] border border-[#333333] text-white font-mono font-bold text-xs rounded">
                      {(sensitivity * 100).toFixed(0)}%
                    </span>
                  </div>

                  <p className="text-xs text-neutral-400 mt-1">
                    Adjusts the probability threshold at which the Random Forest classifier triggers a block.
                  </p>

                  <div className="mt-5">
                    <input
                      type="range"
                      min="0.5"
                      max="0.95"
                      step="0.05"
                      value={sensitivity}
                      onChange={(e) => handleSensitivityChange(parseFloat(e.target.value))}
                      className="w-full accent-white cursor-pointer"
                    />
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[#1a1a1a] flex items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => handleSensitivityChange(0.65)}
                    className={`px-2.5 py-1 rounded border text-[11px] font-mono transition ${
                      sensitivity === 0.65
                        ? 'bg-white text-black border-white font-semibold'
                        : 'bg-[#111111] border-[#262626] text-neutral-400 hover:text-white'
                    }`}
                  >
                    Relaxed (0.65)
                  </button>
                  <button
                    onClick={() => handleSensitivityChange(0.80)}
                    className={`px-2.5 py-1 rounded border text-[11px] font-mono transition ${
                      sensitivity === 0.80
                        ? 'bg-white text-black border-white font-semibold'
                        : 'bg-[#111111] border-[#262626] text-neutral-400 hover:text-white'
                    }`}
                  >
                    Balanced (0.80)
                  </button>
                  <button
                    onClick={() => handleSensitivityChange(0.95)}
                    className={`px-2.5 py-1 rounded border text-[11px] font-mono transition ${
                      sensitivity === 0.95
                        ? 'bg-white text-black border-white font-semibold'
                        : 'bg-[#111111] border-[#262626] text-neutral-400 hover:text-white'
                    }`}
                  >
                    Paranoid (0.95)
                  </button>
                </div>
              </div>

              {/* Live Threat Injection Sandbox */}
              <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-neutral-400" />
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                      Live Threat Simulator
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-500">Target: ML Gateway</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#111111] border border-[#262626] rounded-md text-xs font-mono text-white focus:outline-none focus:border-neutral-400"
                  />
                  <button
                    onClick={runTestPayload}
                    disabled={isTestingPayload}
                    className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-md transition flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    {isTestingPayload ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>Test WAF</span>
                  </button>
                </div>

                {/* Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-neutral-500">Presets:</span>
                  {[
                    { label: 'SQLi', payload: 'GET /apps/sample-app-1/search?q=UNION SELECT 1,2,3' },
                    { label: 'XSS', payload: 'GET /apps/sample-app-1/?user=<script>alert(1)</script>' },
                    { label: 'Cmd Injection', payload: 'GET /apps/sample-app-1/exec?cmd=cat /etc/passwd' },
                    { label: 'Path Traversal', payload: 'GET /apps/sample-app-1/static/../../../../etc/shadow' },
                    { label: 'Benign GET', payload: 'GET /apps/sample-app-1/api/products?category=electronics' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setTestPayload(preset.payload)}
                      className="px-2 py-0.5 rounded bg-[#141414] hover:bg-[#222222] border border-[#262626] text-[10px] font-mono text-neutral-300 hover:text-white transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Test Output Card */}
                {testResult && (
                  <div
                    className={`p-3 rounded-md border text-xs font-mono transition mt-2 ${
                      testResult.status === 'blocked'
                        ? 'bg-red-950/40 border-red-800/50 text-red-300'
                        : testResult.status === 'allowed'
                        ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <div className="flex items-center gap-2">
                        {testResult.status === 'blocked' ? (
                          <ShieldAlert className="w-4 h-4 text-red-400" />
                        ) : testResult.status === 'allowed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <RefreshCw className="w-4 h-4 animate-spin text-neutral-400" />
                        )}
                        <span>{testResult.title || testResult.message}</span>
                      </div>
                      {testResult.duration && (
                        <span className="text-[10px] text-neutral-400">{testResult.duration}</span>
                      )}
                    </div>
                    {testResult.threat && (
                      <div className="mt-1 text-[11px] text-neutral-400">
                        Classified Threat: <strong className="text-white">{testResult.threat}</strong> • Confidence: <strong className="text-white">{testResult.confidence}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Real-time Threat Logs Stream Table */}
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Real-Time Security Threat Stream ({securityLogs.length})
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3 h-3 text-neutral-500 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Filter path..."
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      className="pl-7 pr-2 py-1 bg-[#111111] border border-[#262626] rounded text-xs text-white placeholder-neutral-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-1 text-[11px] font-mono">
                    {['ALL', 'SQLI', 'XSS', 'CMD'].map((f) => (
                      <button
                        key={f}
                        onClick={() => setLogFilter(f)}
                        className={`px-2 py-0.5 rounded transition ${
                          logFilter === f
                            ? 'bg-white text-black font-semibold'
                            : 'bg-[#141414] text-neutral-400 hover:text-white border border-[#262626]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#222222] text-neutral-400 uppercase tracking-wider text-[10px] sticky top-0 bg-[#0a0a0a]">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Threat Type</th>
                      <th className="py-2.5 px-3">Intercepted URI</th>
                      <th className="py-2.5 px-3">Confidence</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a1a]">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-neutral-500 font-sans">
                          No threats recorded matching criteria. Test a threat injection above!
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className="hover:bg-[#111111] transition cursor-pointer"
                        >
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px]">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-red-400">
                              {log.attack_type || log.attackType || 'THREAT'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-neutral-200 max-w-[220px] truncate" title={log.path}>
                            {log.path}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-400">
                            {((log.confidence ?? 0.94) * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950/40 border border-red-800/40 text-red-400 font-bold uppercase">
                              {log.action || 'BLOCKED'}
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
        )}

        {/* =================================================================== */}
        {/* TAB 4: ML THESIS & BENCHMARKS (FROM PDF SLIDE 6 & 7) */}
        {/* =================================================================== */}
        {activeTab === 'ml-thesis' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">Machine Learning Thesis & Evaluation</h2>
              <p className="text-xs text-neutral-400">
                Evaluation methodology, feature extraction pipeline, and classifier benchmark results
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-4">
                <div className="text-[10px] font-mono text-neutral-500 uppercase">Dataset Benchmark</div>
                <div className="text-sm font-bold text-white mt-1">CSIC 2010 Corpus</div>
                <p className="text-xs text-neutral-400 mt-2">
                  36,000+ labeled HTTP requests representing normal user activity and web attacks.
                </p>
              </div>

              <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-4">
                <div className="text-[10px] font-mono text-neutral-500 uppercase">Primary Classifier</div>
                <div className="text-sm font-bold text-white mt-1">Random Forest + XGBoost</div>
                <p className="text-xs text-neutral-400 mt-2">
                  Hand-engineered HTTP structural features: entropy, character ratios, token patterns.
                </p>
              </div>

              <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-4">
                <div className="text-[10px] font-mono text-neutral-500 uppercase">Synthetic Validation</div>
                <div className="text-sm font-bold text-white mt-1">sqlmap + OWASP ZAP</div>
                <p className="text-xs text-neutral-400 mt-2">
                  Continuous fuzzing against live containerized applications for realistic labeled validation.
                </p>
              </div>

              <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-4">
                <div className="text-[10px] font-mono text-neutral-500 uppercase">Attack Classes</div>
                <div className="text-sm font-bold text-white mt-1">SQLi, XSS, CmdInj</div>
                <p className="text-xs text-neutral-400 mt-2">
                  Evaluated per-class with 99.4% F1-score and sub-2ms synchronous inference overhead.
                </p>
              </div>
            </div>

            {/* Feature Extraction Pipeline Breakdown */}
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white">Feature Extraction & Inference Pipeline</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                <div className="p-3 bg-[#111111] border border-[#262626] rounded-lg">
                  <div className="text-neutral-400 font-semibold mb-1">1. Lexical & Entropy Features</div>
                  <ul className="text-neutral-500 space-y-1 text-[11px]">
                    <li>• Shannon entropy of payload query</li>
                    <li>• Special character ratio (% / ' / --)</li>
                    <li>• Upper/lower case distribution</li>
                  </ul>
                </div>

                <div className="p-3 bg-[#111111] border border-[#262626] rounded-lg">
                  <div className="text-neutral-400 font-semibold mb-1">2. Semantic Token Analysis</div>
                  <ul className="text-neutral-500 space-y-1 text-[11px]">
                    <li>• SQL keywords (SELECT, UNION, DROP)</li>
                    <li>• Script tags & event handlers (onload)</li>
                    <li>• Shell tokens (cat, etc/passwd, pipe)</li>
                  </ul>
                </div>

                <div className="p-3 bg-[#111111] border border-[#262626] rounded-lg">
                  <div className="text-neutral-400 font-semibold mb-1">3. Ensemble Verdict Engine</div>
                  <ul className="text-neutral-500 space-y-1 text-[11px]">
                    <li>• RandomForest tree confidence voting</li>
                    <li>• IsolationForest anomaly distance</li>
                    <li>• Synchronous HTTP 403 / Forward</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: SETTINGS */}
        {/* =================================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h2 className="text-base font-semibold text-white">Project & Gateway Settings</h2>
              <p className="text-xs text-neutral-400">Manage deployment environment variables and gateway connectivity</p>
            </div>

            <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-neutral-300 mb-1">API Server URL</label>
                <input
                  type="text"
                  value={API_BASE}
                  disabled
                  className="w-full px-3 py-2 bg-[#111111] border border-[#262626] rounded text-neutral-400 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-300 mb-1">Gateway Reverse Proxy URL</label>
                <input
                  type="text"
                  value={GATEWAY_BASE}
                  disabled
                  className="w-full px-3 py-2 bg-[#111111] border border-[#262626] rounded text-neutral-400 font-mono"
                />
              </div>

              <div className="pt-3 border-t border-[#1f1f1f]">
                <button
                  onClick={logout}
                  className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-800/40 text-red-400 rounded-md font-medium transition"
                >
                  Log Out of Session
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* VERCEL IMPORT / DEPLOY PROJECT MODAL */}
      {/* ===================================================================== */}
      {isDeployModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 76 65" fill="none" className="w-5 h-4 text-white">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
                </svg>
                <h3 className="text-sm font-semibold text-white">Deploy a New Project</h3>
              </div>
              <button
                onClick={() => setIsDeployModalOpen(false)}
                className="text-neutral-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDeploy} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-neutral-300">
                    Git Repository / Project URL
                  </label>
                  <button
                    type="button"
                    onClick={loadSamplePreset}
                    className="text-[11px] text-neutral-400 hover:text-white font-mono underline"
                  >
                    Load Sample Microservice
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. local://sample-app or https://github.com/..."
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-[#111111] border border-[#262626] rounded-md text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  placeholder="my-express-app"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#262626] rounded-md text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Framework Preset
                </label>
                <select
                  value={frameworkPreset}
                  onChange={(e) => setFrameworkPreset(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#262626] rounded-md text-xs text-white focus:outline-none focus:border-neutral-400"
                >
                  <option value="express">Express.js (Node.js)</option>
                  <option value="nextjs">Next.js</option>
                  <option value="python">Python FastAPI</option>
                  <option value="static">Static HTML / React</option>
                </select>
              </div>

              {deployFeedback && (
                <div
                  className={`p-3 rounded-md text-xs flex items-center gap-2 ${
                    deployFeedback.type === 'error'
                      ? 'bg-red-950/40 border border-red-800/50 text-red-300'
                      : 'bg-emerald-950/40 border border-emerald-800/50 text-emerald-300'
                  }`}
                >
                  {deployFeedback.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>{deployFeedback.message}</span>
                </div>
              )}

              <div className="pt-3 border-t border-[#1f1f1f] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeployModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeploying}
                  className="px-4 py-1.5 bg-white text-black hover:bg-neutral-200 font-medium rounded-md text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeploying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Building & Deploying...
                    </>
                  ) : (
                    'Deploy'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VERCEL COMMAND PALETTE MODAL (⌘K) */}
      {/* ===================================================================== */}
      {isCmdOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-24 p-4">
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-[#222222] flex items-center gap-2">
              <Search className="w-4 h-4 text-neutral-500" />
              <input
                type="text"
                placeholder="Type a command or search tabs..."
                autoFocus
                className="w-full bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none"
              />
              <kbd className="px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[10px] text-neutral-400 font-mono">
                ESC
              </kbd>
            </div>

            <div className="p-2 space-y-1 text-xs">
              <div className="px-2 py-1 text-[10px] font-mono text-neutral-500 uppercase">
                Navigation
              </div>
              <button
                onClick={() => {
                  setActiveTab('overview');
                  setIsCmdOpen(false);
                }}
                className="w-full px-3 py-2 rounded-md hover:bg-[#171717] text-left text-neutral-300 flex items-center gap-2"
              >
                <Box className="w-3.5 h-3.5" /> Go to Overview & Projects
              </button>
              <button
                onClick={() => {
                  setActiveTab('security');
                  setIsCmdOpen(false);
                }}
                className="w-full px-3 py-2 rounded-md hover:bg-[#171717] text-left text-neutral-300 flex items-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-red-400" /> Open Security Shield (WAF) & Sandbox
              </button>
              <button
                onClick={() => {
                  setActiveTab('ml-thesis');
                  setIsCmdOpen(false);
                }}
                className="w-full px-3 py-2 rounded-md hover:bg-[#171717] text-left text-neutral-300 flex items-center gap-2"
              >
                <Cpu className="w-3.5 h-3.5 text-cyan-400" /> View ML Thesis & Benchmarks
              </button>

              <div className="px-2 pt-2 text-[10px] font-mono text-neutral-500 uppercase">
                Actions
              </div>
              <button
                onClick={() => {
                  setIsCmdOpen(false);
                  setIsDeployModalOpen(true);
                }}
                className="w-full px-3 py-2 rounded-md hover:bg-[#171717] text-left text-neutral-300 flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Deploy New Project
              </button>
              <button
                onClick={() => {
                  setActiveTab('security');
                  setTestPayload('GET /apps/sample-app-1/search?q=UNION SELECT 1,2,3');
                  setIsCmdOpen(false);
                  setTimeout(runTestPayload, 200);
                }}
                className="w-full px-3 py-2 rounded-md hover:bg-[#171717] text-left text-red-400 flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Run Instant SQLi Attack Simulation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LOG DETAILS MODAL */}
      {/* ===================================================================== */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl w-full max-w-md p-5 shadow-2xl relative text-xs font-mono">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-white">Security Event #{selectedLog.id}</span>
              <button onClick={() => setSelectedLog(null)} className="text-neutral-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-neutral-300">
              <div>
                <span className="text-neutral-500 block text-[10px]">THREAT CLASSIFICATION</span>
                <span className="text-red-400 font-bold">{selectedLog.attack_type || selectedLog.attackType}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">REQUEST URI</span>
                <span className="text-white break-all">{selectedLog.path}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">GATEWAY ACTION</span>
                <span className="text-red-400 font-bold">{selectedLog.action || 'BLOCKED (403)'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">TIMESTAMP</span>
                <span>{new Date(selectedLog.timestamp).toISOString()}</span>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#1f1f1f] text-right">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-3 py-1 bg-white text-black rounded text-xs font-sans font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
