import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface UserPayload {
  username: string;
  role?: string;
  [key: string]: any;
}

export interface AuthenticatedRequest extends Request {
  user?: UserPayload | string;
}

export const SECRET = process.env.JWT_SECRET || 'deployshield-jwt-secret-key-2024-secure';
export const TTL = process.env.JWT_TTL || '24h';

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

  // Allow internal service-to-service communication endpoints
  const isInternalServiceEndpoint =
    (req.method === 'POST' && path === '/api/logs') ||
    (req.method === 'POST' && path === '/api/apps/register') ||
    (req.method === 'GET' && /^\/api\/apps\/[^/]+$/.test(path));

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
    req.user = user as UserPayload;
    next();
  });
}
