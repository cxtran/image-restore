const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../db');

function relPathToAbs(relPath) {
  return path.resolve('.', String(relPath || '').replace(/^\//, ''));
}

function deleteFilesIfPresent(paths = []) {
  paths.forEach((relPath) => {
    if (!relPath) return;
    const absPath = relPathToAbs(relPath);
    if (!fs.existsSync(absPath)) return;
    try {
      fs.unlinkSync(absPath);
    } catch (_error) {
      // Ignore file cleanup failures.
    }
  });
}

exports.listUsers = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.email, COALESCE(u.role, 'user') AS role, u.created_at,
              COUNT(i.id) AS image_count
       FROM users u
       LEFT JOIN images i ON i.user_id = u.id
       GROUP BY u.id, u.email, u.role, u.created_at
       ORDER BY u.created_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'List users failed', error: error.message });
  }
};

exports.createUser = async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const role = String(req.body?.role || 'user').toLowerCase();

  if (!email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Email and password (min 8 chars) are required' });
  }
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Role must be user or admin' });
  }

  try {
    const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length > 0) return res.status(409).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email, hash, role]
    );
    return res.status(201).json({ id: result.insertId, email, role });
  } catch (error) {
    return res.status(500).json({ message: 'Create user failed', error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  if (userId === Number(req.user.id)) {
    return res.status(400).json({ message: 'You cannot delete your own account' });
  }

  try {
    const [users] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (!users[0]) return res.status(404).json({ message: 'User not found' });

    const [images] = await db.query('SELECT id, original_path, current_path FROM images WHERE user_id = ?', [userId]);
    const imageIds = images.map((img) => img.id);
    let versions = [];
    if (imageIds.length > 0) {
      const placeholders = imageIds.map(() => '?').join(',');
      const [vRows] = await db.query(
        `SELECT file_path FROM image_versions WHERE image_id IN (${placeholders})`,
        imageIds
      );
      versions = vRows;
    }

    const pathsToDelete = new Set();
    images.forEach((img) => {
      pathsToDelete.add(img.original_path);
      pathsToDelete.add(img.current_path);
    });
    versions.forEach((v) => pathsToDelete.add(v.file_path));

    await db.query('DELETE FROM users WHERE id = ?', [userId]);
    deleteFilesIfPresent(Array.from(pathsToDelete));
    return res.json({ message: 'User deleted', userId });
  } catch (error) {
    return res.status(500).json({ message: 'Delete user failed', error: error.message });
  }
};

exports.resetUserPassword = async (req, res) => {
  const userId = Number(req.params.id);
  const newPassword = String(req.body?.password || '');
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    const [users] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (!users[0]) return res.status(404).json({ message: 'User not found' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = ?, force_password_change = 1 WHERE id = ?', [hash, userId]);
    // Force logout on all active sessions for safety after password reset.
    await db.query('UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ?', [userId]);
    return res.json({ message: 'Password reset successfully', userId });
  } catch (error) {
    return res.status(500).json({ message: 'Reset password failed', error: error.message });
  }
};

exports.listImages = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT i.id, i.user_id, u.email AS user_email, i.original_name, i.original_path, i.current_path,
              i.created_at, i.updated_at
       FROM images i
       JOIN users u ON u.id = i.user_id
       ORDER BY i.updated_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'List images failed', error: error.message });
  }
};

exports.deleteImageAnyUser = async (req, res) => {
  const imageId = Number(req.params.id);
  if (!Number.isInteger(imageId) || imageId <= 0) {
    return res.status(400).json({ message: 'Invalid image id' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ?', [imageId]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const [versions] = await db.query('SELECT file_path FROM image_versions WHERE image_id = ?', [imageId]);
    const pathsToDelete = new Set();
    pathsToDelete.add(image.original_path);
    pathsToDelete.add(image.current_path);
    versions.forEach((v) => pathsToDelete.add(v.file_path));

    await db.query('DELETE FROM images WHERE id = ?', [imageId]);
    deleteFilesIfPresent(Array.from(pathsToDelete));
    return res.json({ message: 'Image deleted', imageId });
  } catch (error) {
    return res.status(500).json({ message: 'Delete image failed', error: error.message });
  }
};
