const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { processImagePipeline } = require('../services/processingService');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({ storage });

exports.uploadMiddleware = upload.single('photo');

exports.uploadPhoto = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo is required' });

  try {
    const relPath = `/uploads/${req.file.filename}`;
    const [result] = await db.query(
      'INSERT INTO images (user_id, original_name, original_path, current_path) VALUES (?, ?, ?, ?)',
      [req.user.id, req.file.originalname, relPath, relPath]
    );

    await db.query(
      'INSERT INTO image_versions (image_id, version_num, file_path, operations_json) VALUES (?, 1, ?, ?)',
      [result.insertId, relPath, JSON.stringify({ upload: true })]
    );

    return res.status(201).json({ imageId: result.insertId, path: relPath });
  } catch (error) {
    return res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

exports.listMyImages = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT i.id, i.original_name, i.created_at, i.updated_at,
              COALESCE(MAX(v.version_num), 1) AS current_version
       FROM images i
       LEFT JOIN image_versions v ON v.image_id = i.id
       WHERE i.user_id = ?
       GROUP BY i.id
       ORDER BY i.updated_at DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'List failed', error: error.message });
  }
};

exports.processImage = async (req, res) => {
  const imageId = Number(req.params.id);
  const options = req.body || {};

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const [vRows] = await db.query('SELECT COALESCE(MAX(version_num), 1) as v FROM image_versions WHERE image_id = ?', [imageId]);
    const nextVersion = Number(vRows[0].v) + 1;

    const srcFile = path.resolve('.', image.current_path.replace(/^\//, ''));
    const outFileName = `${imageId}-v${nextVersion}-${Date.now()}.jpg`;
    const outFile = path.join(uploadDir, outFileName);
    const outRel = `/uploads/${outFileName}`;

    await processImagePipeline({ inputPath: srcFile, outputPath: outFile, options });

    await db.query('UPDATE images SET current_path = ? WHERE id = ?', [outRel, imageId]);
    await db.query(
      'INSERT INTO image_versions (image_id, version_num, file_path, operations_json) VALUES (?, ?, ?, ?)',
      [imageId, nextVersion, outRel, JSON.stringify(options)]
    );

    return res.json({ imageId, version: nextVersion, path: outRel });
  } catch (error) {
    return res.status(400).json({ message: 'Processing failed', error: error.message });
  }
};

exports.downloadImage = async (req, res) => {
  const imageId = Number(req.params.id);
  const version = req.query.version ? Number(req.query.version) : null;

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    let targetPath = image.current_path;
    if (version) {
      const [vrows] = await db.query('SELECT * FROM image_versions WHERE image_id = ? AND version_num = ?', [imageId, version]);
      if (!vrows[0]) return res.status(404).json({ message: 'Version not found' });
      targetPath = vrows[0].file_path;
    }

    const abs = path.resolve('.', targetPath.replace(/^\//, ''));
    if (!fs.existsSync(abs)) return res.status(404).json({ message: 'File missing on disk' });

    return res.download(abs, `restored-${image.original_name}`);
  } catch (error) {
    return res.status(500).json({ message: 'Download failed', error: error.message });
  }
};
