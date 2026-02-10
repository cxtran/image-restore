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

function getFileSizeBytesFromRelPath(relPath) {
  try {
    const abs = path.resolve('.', String(relPath || '').replace(/^\//, ''));
    if (!fs.existsSync(abs)) return null;
    return fs.statSync(abs).size;
  } catch (_error) {
    return null;
  }
}

function relPathToAbs(relPath) {
  return path.resolve('.', String(relPath || '').replace(/^\//, ''));
}

function deleteFilesIfPresent(paths = []) {
  const failed = [];
  const deleted = [];
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  uniquePaths.forEach((relPath) => {
    if (!relPath) return;
    const absPath = relPathToAbs(relPath);
    const uploadRoot = uploadDir.endsWith(path.sep) ? uploadDir : `${uploadDir}${path.sep}`;
    if (!(absPath === uploadDir || absPath.startsWith(uploadRoot))) {
      failed.push({ path: relPath, error: 'Path is outside upload directory' });
      return;
    }
    if (!fs.existsSync(absPath)) return;
    try {
      fs.unlinkSync(absPath);
      deleted.push(relPath);
    } catch (error) {
      failed.push({ path: relPath, error: error.message });
    }
  });
  return { deleted, failed };
}

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

exports.replaceOriginalImage = async (req, res) => {
  const imageId = Number(req.params.id);
  if (!req.file) return res.status(400).json({ message: 'Photo is required' });

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const newOriginalPath = `/uploads/${req.file.filename}`;
    const oldOriginalPath = image.original_path;
    const shouldUpdateCurrentPath = String(image.current_path || '') === String(oldOriginalPath || '');

    await db.query('UPDATE images SET original_path = ?, current_path = IF(? = 1, ?, current_path) WHERE id = ?', [
      newOriginalPath,
      shouldUpdateCurrentPath ? 1 : 0,
      newOriginalPath,
      imageId
    ]);

    await db.query(
      'UPDATE image_versions SET file_path = ?, operations_json = ? WHERE image_id = ? AND version_num = 1',
      [newOriginalPath, JSON.stringify({ original_replaced: true }), imageId]
    );

    const [usage] = await db.query(
      'SELECT COUNT(*) AS c FROM image_versions WHERE file_path = ?',
      [oldOriginalPath]
    );
    const stillReferencedByCurrent = String(image.current_path || '') === String(oldOriginalPath || '') && !shouldUpdateCurrentPath;
    if (oldOriginalPath && Number(usage[0]?.c || 0) === 0 && !stillReferencedByCurrent) {
      deleteFilesIfPresent([oldOriginalPath]);
    }

    return res.json({ message: 'Original image updated', imageId, original_path: newOriginalPath });
  } catch (error) {
    return res.status(500).json({ message: 'Update original failed', error: error.message });
  }
};

exports.listMyImages = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT i.id, i.original_name, i.original_path, i.current_path, i.created_at, i.updated_at,
              v.version_num, v.file_path, v.created_at AS version_created_at
       FROM images i
       LEFT JOIN image_versions v ON v.image_id = i.id
       WHERE i.user_id = ?
       ORDER BY i.updated_at DESC, v.version_num ASC`,
      [req.user.id]
    );

    const byId = new Map();
    rows.forEach((row) => {
      if (!byId.has(row.id)) {
        byId.set(row.id, {
          id: row.id,
          original_name: row.original_name,
          original_path: row.original_path,
          current_path: row.current_path,
          created_at: row.created_at,
          updated_at: row.updated_at,
          original_size_bytes: getFileSizeBytesFromRelPath(row.original_path),
          current_size_bytes: getFileSizeBytesFromRelPath(row.current_path),
          versions: []
        });
      }

      const image = byId.get(row.id);
      if (row.version_num !== null && row.file_path) {
        image.versions.push({
          version_num: row.version_num,
          file_path: row.file_path,
          size_bytes: getFileSizeBytesFromRelPath(row.file_path),
          created_at: row.version_created_at
        });
      }
    });

    const enriched = Array.from(byId.values()).map((image) => ({
      ...image,
      current_version: image.versions.length ? image.versions[image.versions.length - 1].version_num : 1
    }));
    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ message: 'List failed', error: error.message });
  }
};

exports.processImage = async (req, res) => {
  const imageId = Number(req.params.id);
  const payload = req.body || {};
  const { socketId, ...options } = payload;
  const io = req.app.get('io');
  const emitProgress = (progress, message, extra = {}) => {
    if (!io || !socketId) return;
    io.to(socketId).emit('restore-progress', {
      imageId,
      progress,
      message,
      ...extra
    });
  };

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    // Default to original image as enhancement input so toggles reflect a clean source.
    const useCurrentInput = options.use_current_input === true || String(options.use_current_input).toLowerCase() === 'true';
    const sourceRelPath = useCurrentInput ? image.current_path : (image.original_path || image.current_path);
    const srcFile = path.resolve('.', String(sourceRelPath || '').replace(/^\//, ''));
    const outFileName = `${imageId}-preview-${Date.now()}.jpg`;
    const outFile = path.join(uploadDir, outFileName);
    const outRel = `/uploads/${outFileName}`;

    emitProgress(5, 'Queued');
    await processImagePipeline({
      inputPath: srcFile,
      outputPath: outFile,
      options,
      onProgress: (progress, message) => emitProgress(progress, message)
    });

    const previewSizeBytes = getFileSizeBytesFromRelPath(outRel);
    emitProgress(100, 'Completed', { preview_path: outRel, done: true });
    return res.json({
      imageId,
      preview_path: outRel,
      path: outRel,
      preview_size_bytes: previewSizeBytes,
      message: 'Preview generated. Use Enhanced Image to save.'
    });
  } catch (error) {
    emitProgress(-1, error.message || 'Processing failed', { error: true });
    return res.status(400).json({ message: 'Processing failed', error: error.message });
  }
};

exports.discardPreviewImage = async (req, res) => {
  const imageId = Number(req.params.id);
  const previewPath = String(req.body?.preview_path || '');
  if (!previewPath || !previewPath.startsWith('/uploads/')) {
    return res.status(400).json({ message: 'preview_path is required and must be under /uploads/' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const fileName = path.basename(previewPath);
    if (!fileName.startsWith(`${imageId}-preview-`)) {
      return res.status(400).json({ message: 'Invalid preview_path for this image' });
    }
    if (previewPath === image.original_path || previewPath === image.current_path) {
      return res.status(400).json({ message: 'Refusing to delete original/current image path' });
    }

    const absPath = relPathToAbs(previewPath);
    const uploadRoot = uploadDir.endsWith(path.sep) ? uploadDir : `${uploadDir}${path.sep}`;
    if (!(absPath === uploadDir || absPath.startsWith(uploadRoot))) {
      return res.status(400).json({ message: 'Invalid preview path location' });
    }

    if (!fs.existsSync(absPath)) {
      return res.json({ message: 'Preview already absent', imageId, deleted: false });
    }
    fs.unlinkSync(absPath);
    return res.json({ message: 'Preview deleted', imageId, deleted: true });
  } catch (error) {
    return res.status(500).json({ message: 'Discard preview failed', error: error.message });
  }
};

exports.acceptEnhancedImage = async (req, res) => {
  const imageId = Number(req.params.id);
  const previewPath = String(req.body?.preview_path || '');

  if (!previewPath || !previewPath.startsWith('/uploads/')) {
    return res.status(400).json({ message: 'preview_path is required and must be under /uploads/' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const absPreview = path.resolve('.', previewPath.replace(/^\//, ''));
    if (!fs.existsSync(absPreview)) {
      return res.status(404).json({ message: 'Preview file not found on disk' });
    }

    const [vRows] = await db.query('SELECT COALESCE(MAX(version_num), 1) as v FROM image_versions WHERE image_id = ?', [imageId]);
    const nextVersion = Number(vRows[0].v) + 1;

    await db.query('UPDATE images SET current_path = ? WHERE id = ?', [previewPath, imageId]);
    await db.query(
      'INSERT INTO image_versions (image_id, version_num, file_path, operations_json) VALUES (?, ?, ?, ?)',
      [imageId, nextVersion, previewPath, JSON.stringify({ accepted_preview: true })]
    );

    return res.json({ message: 'Enhanced image saved', imageId, version: nextVersion, path: previewPath });
  } catch (error) {
    return res.status(500).json({ message: 'Accept failed', error: error.message });
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

exports.deleteImage = async (req, res) => {
  const imageId = Number(req.params.id);

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const [versions] = await db.query('SELECT file_path FROM image_versions WHERE image_id = ?', [imageId]);

    const pathsToDelete = new Set();
    pathsToDelete.add(image.original_path);
    pathsToDelete.add(image.current_path);
    versions.forEach((v) => pathsToDelete.add(v.file_path));

    const cleanup = deleteFilesIfPresent(Array.from(pathsToDelete));
    if (cleanup.failed.length) {
      return res.status(500).json({
        message: 'Image files could not be deleted from server',
        imageId,
        failed_files: cleanup.failed
      });
    }

    await db.query('DELETE FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);

    return res.json({ message: 'Image deleted', imageId, deleted_files: cleanup.deleted.length });
  } catch (error) {
    return res.status(500).json({ message: 'Delete failed', error: error.message });
  }
};

exports.deleteEnhancedVersions = async (req, res) => {
  const imageId = Number(req.params.id);
  const requestedVersions = Array.isArray(req.body?.versions) ? req.body.versions : [];
  const versions = Array.from(new Set(requestedVersions.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 1)));

  if (!versions.length) {
    return res.status(400).json({ message: 'Provide at least one enhanced version number (> 1)' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const placeholders = versions.map(() => '?').join(',');
    const [toDelete] = await db.query(
      `SELECT version_num, file_path FROM image_versions
       WHERE image_id = ? AND version_num IN (${placeholders}) AND version_num > 1`,
      [imageId, ...versions]
    );
    if (!toDelete.length) return res.status(404).json({ message: 'No matching enhanced versions found' });

    await db.query(
      `DELETE FROM image_versions
       WHERE image_id = ? AND version_num IN (${placeholders}) AND version_num > 1`,
      [imageId, ...versions]
    );

    const [remaining] = await db.query(
      'SELECT version_num, file_path FROM image_versions WHERE image_id = ? ORDER BY version_num ASC',
      [imageId]
    );
    const last = remaining[remaining.length - 1];
    const newCurrentPath = (last && last.file_path) ? last.file_path : image.original_path;
    await db.query('UPDATE images SET current_path = ? WHERE id = ?', [newCurrentPath, imageId]);

    const protectedPaths = new Set([image.original_path, newCurrentPath]);
    remaining.forEach((v) => protectedPaths.add(v.file_path));
    const candidateDeletePaths = toDelete
      .map((v) => v.file_path)
      .filter((p) => p && !protectedPaths.has(p));
    deleteFilesIfPresent(candidateDeletePaths);

    return res.json({
      message: `Deleted ${toDelete.length} enhanced version(s)`,
      imageId,
      deleted_versions: toDelete.map((v) => v.version_num).sort((a, b) => a - b),
      current_path: newCurrentPath
    });
  } catch (error) {
    return res.status(500).json({ message: 'Delete enhanced versions failed', error: error.message });
  }
};

exports.deleteAllEnhancedVersions = async (req, res) => {
  const imageId = Number(req.params.id);

  try {
    const [rows] = await db.query('SELECT * FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    const image = rows[0];
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const [enhanced] = await db.query(
      'SELECT version_num, file_path FROM image_versions WHERE image_id = ? AND version_num > 1 ORDER BY version_num ASC',
      [imageId]
    );

    await db.query('DELETE FROM image_versions WHERE image_id = ? AND version_num > 1', [imageId]);
    await db.query('UPDATE images SET current_path = ? WHERE id = ?', [image.original_path, imageId]);

    const pathsToDelete = enhanced
      .map((v) => v.file_path)
      .filter((p) => p && p !== image.original_path);
    deleteFilesIfPresent(pathsToDelete);

    return res.json({
      message: enhanced.length ? `Deleted ${enhanced.length} enhanced version(s)` : 'No enhanced versions to delete',
      imageId,
      deleted_versions: enhanced.map((v) => v.version_num),
      current_path: image.original_path
    });
  } catch (error) {
    return res.status(500).json({ message: 'Delete all enhanced versions failed', error: error.message });
  }
};
