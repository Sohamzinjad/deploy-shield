// src/login.ts
import express, { Request, Response, Router } from 'express';
import { generateToken } from './auth';

const router: Router = express.Router();

const DEMO_USER = process.env.ADMIN_USER || 'admin';
const DEMO_PASS = process.env.ADMIN_PASSWORD || 'password123';

// Handler for login
export const handleLogin = (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (username === DEMO_USER && password === DEMO_PASS) {
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
