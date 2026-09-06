const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'deployshield-jwt-secret-key-2024-secure';
const TTL = process.env.JWT_TTL || '24h';

function generateToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TTL });
}

function authenticateToken(req, res, next) {
  // Allow health check, login, logout, and auth routes without token
  const path = req.path;
  const isAuthOrHealth =
    path === '/health' ||
    path === '/login' ||
    path === '/api/login' ||
    path === '/logout' ||
    path === '/api/logout' ||
    path.startsWith('/auth/');

  // Allow internal service-to-service communication endpoints
  const isInternalServiceEndpoint =
    (req.method === 'POST' && path === '/api/logs') ||
    (req.method === 'POST' && path === '/api/apps/register');

  if (isAuthOrHealth || isInternalServiceEndpoint) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

module.exports = { generateToken, authenticateToken, SECRET };
