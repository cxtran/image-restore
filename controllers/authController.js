require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'fallbackSecret';

exports.register = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Email and password (min 8 chars) are required' });
  }

  try {
    const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [String(email).toLowerCase()]);
    if (exists.length > 0) return res.status(409).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [String(email).toLowerCase(), hash]);

    return res.status(201).json({ id: result.insertId, email: String(email).toLowerCase() });
  } catch (error) {
    return res.status(500).json({ message: 'Register failed', error: error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [String(email || '').toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isValid = await bcrypt.compare(password || '', user.password_hash);
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET);
    await db.query('INSERT INTO user_sessions (user_id, token, is_revoked) VALUES (?, ?, 0)', [user.id, token]);

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });

    return res.json({ message: 'Login successful', user: { id: user.id, email: user.email } });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

exports.logout = async (req, res) => {
  const token = req.cookies?.token;
  try {
    if (token) {
      await db.query('UPDATE user_sessions SET is_revoked = 1 WHERE token = ?', [token]);
    }
    res.clearCookie('token');
    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Logout failed', error: error.message });
  }
};

exports.me = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, email FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    return res.json(rows[0]);
  } catch (error) {
    return res.status(500).json({ message: 'Fetch user failed', error: error.message });
  }
};
