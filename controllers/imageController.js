const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db');
const { processImagePipeline } = require('../services/processingService');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const iconDir = path.join(uploadDir, 'icons');
if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });

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
    const abs = relPathToAbs(relPath);
    if (!fs.existsSync(abs)) return null;
    return fs.statSync(abs).size;
  } catch (_error) {
    return null;
  }
}

function normalizeRelPath(relPath) {
  return String(relPath || '').trim().replace(/\\/g, '/');
}

function relPathToAbs(relPath) {
  const normalizedRaw = normalizeRelPath(relPath);
  const normalized = normalizedRaw.replace(/^\/+/, '');

  // Prefer resolving logical "/uploads/..." paths against the configured upload directory.
  if (normalizedRaw.startsWith('/uploads/')) {
    return path.join(uploadDir, normalizedRaw.slice('/uploads/'.length));
  }
  if (normalized.startsWith('uploads/')) {
    return path.join(uploadDir, normalized.slice('uploads/'.length));
  }

  if (path.isAbsolute(normalizedRaw)) {
    return path.normalize(normalizedRaw);
  }
  return path.resolve('.', normalized);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function unlinkWithRetry(absPath, maxRetries = 6, waitMs = 120) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      await fs.promises.unlink(absPath);
      return null;
    } catch (error) {
      const code = String(error?.code || '');
      const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!retryable || attempt === maxRetries) return error;
      attempt += 1;
      await delay(waitMs * attempt);
    }
  }
  return null;
}

async function deleteFilesIfPresent(paths = []) {
  const failed = [];
  const deleted = [];
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  for (const relPath of uniquePaths) {
    if (!relPath) continue;
    const normalizedRel = normalizeRelPath(relPath);
    let absPath = relPathToAbs(normalizedRel);
    const uploadRoot = uploadDir.endsWith(path.sep) ? uploadDir : `${uploadDir}${path.sep}`;
    if (!(absPath === uploadDir || absPath.startsWith(uploadRoot))) {
      failed.push({ path: relPath, error: 'Path is outside upload directory' });
      continue;
    }
    if (!fs.existsSync(absPath)) {
      // Fallback for legacy/mismatched stored path formats: try basename under uploadDir.
      const baseName = path.basename(normalizedRel);
      if (!baseName || baseName === '.' || baseName === '..') continue;
      const fallbackAbs = path.join(uploadDir, baseName);
      if (!(fallbackAbs === uploadDir || fallbackAbs.startsWith(uploadRoot))) continue;
      if (!fs.existsSync(fallbackAbs)) continue;
      absPath = fallbackAbs;
    }
    const unlinkError = await unlinkWithRetry(absPath);
    if (!unlinkError) {
      deleted.push(relPath);
    } else {
      failed.push({ path: relPath, error: unlinkError.message });
    }
  }
  return { deleted, failed };
}

async function createImageIconFromRelPath(imageId, sourceRelPath) {
  if (!imageId || !sourceRelPath) return '';
  const sourceAbs = relPathToAbs(sourceRelPath);
  if (!fs.existsSync(sourceAbs)) return '';
  const iconFileName = `${Number(imageId)}-icon.jpg`;
  const iconAbs = path.join(iconDir, iconFileName);
  try {
    const sourceBuffer = await fs.promises.readFile(sourceAbs);
    await sharp(sourceBuffer)
      .rotate()
      .resize(160, 160, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(iconAbs);
    return `/uploads/icons/${iconFileName}`;
  } catch (_error) {
    return '';
  }
}

exports.uploadPhoto = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo is required' });

  try {
    const relPath = `/uploads/${req.file.filename}`;
    const caption = req.body?.caption ? String(req.body.caption).trim().slice(0, 1000) : null;
    const [result] = await db.query(
      'INSERT INTO images (user_id, original_name, caption, original_path, current_path) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, req.file.originalname, caption, relPath, relPath]
    );
    const iconPath = await createImageIconFromRelPath(result.insertId, relPath);
    if (iconPath) {
      await db.query('UPDATE images SET icon_path = ? WHERE id = ?', [iconPath, result.insertId]);
    }

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
    const hasCaption = Object.prototype.hasOwnProperty.call(req.body || {}, 'caption');
    const nextCaption = hasCaption ? String(req.body?.caption || '').trim().slice(0, 1000) : null;
    const nextIconPath = await createImageIconFromRelPath(imageId, newOriginalPath);
    const hasIcon = Boolean(nextIconPath);

    await db.query(
      `UPDATE images
       SET original_path = ?,
           current_path = IF(? = 1, ?, current_path),
           caption = IF(? = 1, ?, caption),
           icon_path = IF(? = 1, ?, icon_path)
       WHERE id = ?`,
      [
      newOriginalPath,
      shouldUpdateCurrentPath ? 1 : 0,
      newOriginalPath,
      hasCaption ? 1 : 0,
      nextCaption,
      hasIcon ? 1 : 0,
      nextIconPath,
      imageId
      ]
    );

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
      await deleteFilesIfPresent([oldOriginalPath]);
    }

    return res.json({ message: 'Original image updated', imageId, original_path: newOriginalPath });
  } catch (error) {
    return res.status(500).json({ message: 'Update original failed', error: error.message });
  }
};

exports.listMyImages = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT i.id, i.original_name, i.caption, i.icon_path, i.original_path, i.current_path, i.created_at, i.updated_at,
              v.version_num, v.file_path, v.is_shared AS version_is_shared, v.created_at AS version_created_at
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
          caption: row.caption || '',
          icon_path: row.icon_path || '',
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
          is_shared: Number(row.version_is_shared) === 1,
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

exports.listSharedImages = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT i.id, i.user_id, u.email AS owner_email, i.original_name, i.caption, i.icon_path, i.original_path, i.current_path, i.created_at, i.updated_at,
              v.version_num, v.file_path, v.is_shared AS version_is_shared, v.created_at AS version_created_at
       FROM images i
       INNER JOIN users u ON u.id = i.user_id
       INNER JOIN image_versions v ON v.image_id = i.id AND v.is_shared = 1
       ORDER BY i.updated_at DESC, v.version_num ASC`,
      []
    );

    const byId = new Map();
    rows.forEach((row) => {
      if (!byId.has(row.id)) {
        byId.set(row.id, {
          id: row.id,
          user_id: row.user_id,
          owner_email: row.owner_email,
          original_name: row.original_name,
          caption: row.caption || '',
          icon_path: row.icon_path || '',
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
          is_shared: Number(row.version_is_shared) === 1,
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
    return res.status(500).json({ message: 'List shared images failed', error: error.message });
  }
};

exports.updateImageCaption = async (req, res) => {
  const imageId = Number(req.params.id);
  const caption = req.body?.caption === undefined || req.body?.caption === null
    ? ''
    : String(req.body.caption).trim().slice(0, 1000);

  try {
    const [rows] = await db.query('SELECT id FROM images WHERE id = ? AND user_id = ?', [imageId, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Image not found' });

    await db.query('UPDATE images SET caption = ? WHERE id = ?', [caption || null, imageId]);
    return res.json({ message: 'Caption updated', imageId, caption });
  } catch (error) {
    return res.status(500).json({ message: 'Caption update failed', error: error.message });
  }
};

exports.setImageShared = async (req, res) => {
  const imageId = Number(req.params.id);
  const versionNum = Number(req.body?.version);
  const shared = Boolean(req.body && req.body.shared);
  if (!Number.isInteger(versionNum) || versionNum < 1) {
    return res.status(400).json({ message: 'version must be an integer >= 1' });
  }
  try {
    const [rows] = await db.query(
      `SELECT iv.image_id, iv.version_num
       FROM image_versions iv
       INNER JOIN images i ON i.id = iv.image_id
       WHERE i.id = ? AND i.user_id = ? AND iv.version_num = ?`,
      [imageId, req.user.id, versionNum]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Image not found' });

    await db.query(
      'UPDATE image_versions SET is_shared = ? WHERE image_id = ? AND version_num = ?',
      [shared ? 1 : 0, imageId, versionNum]
    );
    return res.json({
      message: shared ? 'Image version shared' : 'Image version unshared',
      imageId,
      version: versionNum,
      is_shared: shared
    });
  } catch (error) {
    return res.status(500).json({ message: 'Share update failed', error: error.message });
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
    const srcFile = relPathToAbs(sourceRelPath);
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

    const absPreview = relPathToAbs(previewPath);
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

    const abs = relPathToAbs(targetPath);
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
    pathsToDelete.add(image.icon_path);
    pathsToDelete.add(image.original_path);
    pathsToDelete.add(image.current_path);
    versions.forEach((v) => pathsToDelete.add(v.file_path));

    const cleanup = await deleteFilesIfPresent(Array.from(pathsToDelete));
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
    await deleteFilesIfPresent(candidateDeletePaths);

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
    await deleteFilesIfPresent(pathsToDelete);

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
