const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');

const mediaDir = path.join(__dirname, '..', 'public', 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

const allowedExt = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, mediaDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const base = path.basename(String(file.originalname || 'track'), ext).replace(/[^\w\- ]+/g, '').trim();
    const safeBase = (base || 'track').slice(0, 80).replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  if (!allowedExt.has(ext)) {
    cb(new Error('Only audio files are allowed (.mp3, .wav, .ogg, .m4a, .aac)'));
    return;
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter });

exports.uploadMusicMiddleware = upload.single('music');

exports.listMusic = async (_req, res) => {
  try {
    const files = fs.readdirSync(mediaDir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => allowedExt.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    return res.json(files.map((name) => ({
      name,
      url: `/media/${encodeURIComponent(name)}`
    })));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load music list', error: error.message });
  }
};

exports.uploadMusic = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Music file is required' });
  return res.status(201).json({
    message: 'Music uploaded',
    file: {
      name: req.file.filename,
      url: `/media/${encodeURIComponent(req.file.filename)}`
    }
  });
};

function sanitizeConfig(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const name = String(raw.name || '').trim().slice(0, 120);
  const speedSeconds = Math.max(1, Math.min(30, Number(raw.speedSeconds || 5) || 5));
  const effect = ['fade', 'zoom', 'slide'].includes(String(raw.effect)) ? String(raw.effect) : 'fade';
  const showCaption = Boolean(raw.showCaption);
  const slides = Array.isArray(raw.slides) ? raw.slides
    .filter((s) => s && typeof s === 'object' && String(s.path || '').trim())
    .map((s) => ({
      key: String(s.key || ''),
      image_id: Number(s.image_id) || null,
      version_num: Number(s.version_num) || null,
      path: String(s.path || ''),
      name: String(s.name || ''),
      caption: String(s.caption || ''),
      owner: String(s.owner || '')
    })) : [];
  const music = Array.isArray(raw.music) ? raw.music
    .filter((m) => m && typeof m === 'object' && String(m.url || '').trim())
    .map((m) => ({
      name: String(m.name || ''),
      url: String(m.url || '')
    })) : [];
  return {
    name: name || 'Private Slideshow',
    speedSeconds,
    effect,
    showCaption,
    slides,
    music
  };
}

exports.listPrivateSlideshows = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, updated_at, JSON_LENGTH(config_json, '$.slides') AS slide_count
       FROM private_slideshows
       WHERE user_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [req.user.id]
    );
    return res.json(rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name || ''),
      updated_at: row.updated_at,
      slide_count: Number(row.slide_count || 0)
    })));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to list private slideshows', error: error.message });
  }
};

exports.createPrivateSlideshow = async (req, res) => {
  const config = sanitizeConfig(req.body?.config);
  if (!config.slides.length) {
    return res.status(400).json({ message: 'A slideshow needs at least one slide' });
  }
  try {
    const [insert] = await db.query(
      'INSERT INTO private_slideshows (user_id, name, config_json) VALUES (?, ?, ?)',
      [req.user.id, config.name, JSON.stringify(config)]
    );
    return res.status(201).json({ id: insert.insertId, name: config.name });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create private slideshow', error: error.message });
  }
};

exports.getPrivateSlideshow = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid slideshow id' });
  }
  try {
    const [rows] = await db.query(
      'SELECT id, name, config_json, updated_at FROM private_slideshows WHERE id = ? AND user_id = ? LIMIT 1',
      [id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Private slideshow not found' });
    const row = rows[0];
    let parsed = null;
    try {
      parsed = typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json;
    } catch (_err) {
      parsed = null;
    }
    const config = sanitizeConfig(parsed);
    config.name = String(row.name || config.name || 'Private Slideshow');
    return res.json({
      id: Number(row.id),
      name: String(row.name || ''),
      updated_at: row.updated_at,
      config
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load private slideshow', error: error.message });
  }
};

exports.deletePrivateSlideshow = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid slideshow id' });
  }
  try {
    const [result] = await db.query(
      'DELETE FROM private_slideshows WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Private slideshow not found' });
    return res.json({ message: 'Private slideshow deleted', id });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete private slideshow', error: error.message });
  }
};

exports.updatePrivateSlideshow = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid slideshow id' });
  }
  const config = sanitizeConfig(req.body?.config);
  if (!config.slides.length) {
    return res.status(400).json({ message: 'A slideshow needs at least one slide' });
  }
  try {
    const [result] = await db.query(
      'UPDATE private_slideshows SET name = ?, config_json = ? WHERE id = ? AND user_id = ?',
      [config.name, JSON.stringify(config), id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Private slideshow not found' });
    return res.json({ message: 'Private slideshow updated', id, name: config.name });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update private slideshow', error: error.message });
  }
};
