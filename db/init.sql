-- DeployShield PostgreSQL Database Schema & Analytics Views

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT,
  status TEXT DEFAULT 'running',
  target_url TEXT,
  host_port INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  client_ip TEXT,
  method TEXT,
  path TEXT,
  attack_type TEXT,
  confidence FLOAT,
  action TEXT DEFAULT 'BLOCKED'
);

-- Materialized or standard aggregation view for dashboard telemetry
CREATE OR REPLACE VIEW app_stats AS
SELECT
  COALESCE((SELECT COUNT(*)::INTEGER FROM security_logs WHERE action = 'BLOCKED'), 0) AS total_blocked,
  COALESCE((
    SELECT jsonb_object_agg(COALESCE(attack_type, 'UNKNOWN'), cnt)
    FROM (
      SELECT attack_type, COUNT(*)::INTEGER AS cnt
      FROM security_logs
      WHERE action = 'BLOCKED'
      GROUP BY attack_type
    ) s
  ), '{}'::jsonb) AS blocks_by_type;
