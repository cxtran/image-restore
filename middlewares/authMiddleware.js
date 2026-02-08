require('dotenv').config();

const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'fallbackSecret';

async function verifyToken(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: 'Token not found in cookie' });

  try {
    const decoded = jwt.verify(token, SECRET);
    const [rows] = await db.query(
      'SELECT id FROM user_sessions WHERE user_id = ? AND token = ? AND is_revoked = 0 LIMIT 1',
      [decoded.id, token]
    );
    if (rows.length === 0) return res.status(401).json({ message: 'Session revoked' });
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
}

module.exports = { verifyToken };
