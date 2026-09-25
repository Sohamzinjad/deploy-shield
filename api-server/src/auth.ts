import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface UserPayload {
  username: string;
  role?: string;
  [key: string]: any;
}

export interface AuthenticatedRequest extends Request {
  user?: UserPayload | string;
}

// A development fallback keeps local tests convenient. Production must provide a
// unique secret; a known fallback must never be used for a deployed control plane.
export const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
export const TTL = process.env.JWT_TTL || '24h';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in production');
}

export function authenticateInternalService(req: Request, res: Response, next: NextFunction): void | Response {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  const received = req.header('x-internal-service-token');

  if (!expected || !received) {
    return res.status(403).json({ error: 'Internal service authentication required' });
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return res.status(403).json({ error: 'Invalid internal service credentials' });
  }
  next();
}

export function generateToken(payload: object): string {
  return jwt.sign(payload, SECRET, { expiresIn: TTL as any });
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void | Response {
  // Allow health check, login, logout, and auth routes without token
  const path = req.path;
  const isAuthOrHealth =
    path === '/health' ||
    path === '/login' ||
    path === '/api/login' ||
    path === '/logout' ||
    path === '/api/logout' ||
    path.startsWith('/auth/');

  // These routes are only callable by services on the Compose network. They
  // still require an explicit token because the API port may be published.
  const isInternalServiceEndpoint =
    (req.method === 'POST' && path === '/api/logs') ||
    (req.method === 'POST' && path === '/api/apps/register') ||
    (req.method === 'POST' && path === '/api/telemetry/scored') ||
    (req.method === 'GET' && /^\/api\/apps\/[^/]+$/.test(path)) ||
    (req.method === 'GET' && path.startsWith('/api/apps/by-domain/'));

  if (isAuthOrHealth) {
    return next();
  }
  if (isInternalServiceEndpoint) {
    if (req.header('x-internal-service-token') || !req.headers['authorization']) {
      return authenticateInternalService(req, res, next);
    }
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
    req.user = user as UserPayload;
    next();
  });
}
