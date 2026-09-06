const request = require('supertest');
const app = require('../src/index');
const { generateToken } = require('../src/auth');

// Mock pg pool so tests run independently of external DB connection
jest.mock('../src/db', () => {
  const mockRows = [];
  return {
    pool: {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('app_stats')) {
          return { rows: [{ total_blocked: 5, blocks_by_type: { SQLI: 3, XSS: 2 } }] };
        }
        if (sql.includes('SELECT * FROM apps WHERE id')) {
          const id = params && params[0];
          return { rows: [{ id: id || 'test-app', name: 'Test App', status: 'running' }] };
        }
        if (sql.includes('SELECT * FROM apps')) {
          return { rows: [{ id: 'app-1', name: 'Test App 1', status: 'running' }] };
        }
        if (sql.includes('SELECT * FROM security_logs')) {
          return { rows: [{ id: 'evt-1', attack_type: 'SQLI', action: 'BLOCKED', timestamp: new Date().toISOString() }] };
        }
        if (sql.includes('INSERT INTO')) {
          return { rows: [] };
        }
        return { rows: [] };
      })
    },
    runMigrations: jest.fn().mockResolvedValue(true)
  };
});

describe('DeployShield API Server Integration Tests', () => {
  let validToken;

  beforeAll(() => {
    validToken = generateToken({ username: 'admin', role: 'admin' });
  });

  describe('Health Endpoint', () => {
    it('GET /health should return 200 and status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ service: 'api-server', status: 'ok' });
    });
  });

  describe('Authentication Endpoints', () => {
    it('POST /login with valid demo credentials should return token', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'admin', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('POST /api/login with valid demo credentials should return token', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('POST /login with invalid credentials should return 401', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid credentials/i);
    });

    it('POST /logout should return 200', async () => {
      const res = await request(app).post('/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Authorization Middleware & Protected Endpoints', () => {
    it('GET /api/apps without token should return 401', async () => {
      const res = await request(app).get('/api/apps');
      expect(res.status).toBe(401);
    });

    it('GET /api/stats without token should return 401', async () => {
      const res = await request(app).get('/api/stats');
      expect(res.status).toBe(401);
    });

    it('GET /api/apps with invalid token should return 403', async () => {
      const res = await request(app)
        .get('/api/apps')
        .set('Authorization', 'Bearer invalid-token-string');
      expect(res.status).toBe(403);
    });

    it('GET /api/apps with valid token should return 200 and list apps', async () => {
      const res = await request(app)
        .get('/api/apps')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /api/stats with valid token should return computed stats', async () => {
      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalBlocked).toBe(5);
      expect(res.body.blocksByType).toHaveProperty('SQLI');
    });

    it('POST /api/logs should succeed without token (internal gateway whitelist)', async () => {
      const res = await request(app)
        .post('/api/logs')
        .send({
          clientIp: '192.168.1.1',
          method: 'GET',
          path: '/apps/test?q=UNION SELECT',
          attackType: 'SQLI',
          confidence: 0.95,
          action: 'BLOCKED'
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Log recorded');
    });

    it('POST /api/apps/register should succeed without token (internal build-service whitelist)', async () => {
      const res = await request(app)
        .post('/api/apps/register')
        .send({
          id: 'app-sample',
          name: 'Sample App',
          targetUrl: 'http://deployshield-app-sample:3000',
          hostPort: 8085
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('App registered successfully');
    });
  });
});
