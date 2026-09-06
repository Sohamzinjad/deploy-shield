// src/login.js
const express = require('express');
const router = express.Router();
const { generateToken } = require('./auth');

const DEMO_USER = process.env.ADMIN_USER || 'admin';
const DEMO_PASS = process.env.ADMIN_PASSWORD || 'password123';

// Handler for login
const handleLogin = (req, res) => {
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
const handleLogout = (req, res) => {
  return res.json({ success: true, message: 'Logged out successfully' });
};

// Mount routes on both root and /api prefixes
router.post('/login', handleLogin);
router.post('/api/login', handleLogin);
router.post('/logout', handleLogout);
router.post('/api/logout', handleLogout);

module.exports = router;
