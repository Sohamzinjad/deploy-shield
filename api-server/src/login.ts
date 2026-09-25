import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { generateToken } from './auth';

const router: Router = express.Router();

if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD)) {
  throw new Error('ADMIN_USER and ADMIN_PASSWORD must be configured in production');
}

// Handler for login
export const handleLogin = (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const configuredUser = process.env.ADMIN_USER;
  const configuredPass = process.env.ADMIN_PASSWORD;

  // Fail closed if either credential is not configured or payload is invalid
  if (!configuredUser || !configuredPass || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const userBuffer = Buffer.from(username);
  const configuredUserBuffer = Buffer.from(configuredUser);
  const passBuffer = Buffer.from(password);
  const configuredPassBuffer = Buffer.from(configuredPass);

  const userMatch =
    userBuffer.length === configuredUserBuffer.length &&
    crypto.timingSafeEqual(userBuffer, configuredUserBuffer);

  const passMatch =
    passBuffer.length === configuredPassBuffer.length &&
    crypto.timingSafeEqual(passBuffer, configuredPassBuffer);

  if (userMatch && passMatch) {
    const token = generateToken({ username, role: 'admin' });
    return res.json({
      success: true,
      token,
      user: { username, role: 'admin' }
    });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
};

// Handler for logout
export const handleLogout = (req: Request, res: Response) => {
  return res.json({ success: true, message: 'Logged out successfully' });
};

// Mount routes on both root and /api prefixes
router.post('/login', handleLogin);
router.post('/api/login', handleLogin);
router.post('/logout', handleLogout);
router.post('/api/logout', handleLogout);

export default router;
