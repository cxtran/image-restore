const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

const RESTORE_API_BASE = process.env.ESRGAN_URL || process.env.RESTORE_API_URL || '';

function runCommand(template, inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = template
      .replaceAll('{input}', `"${inputPath}"`)
      .replaceAll('{output}', `"${outputPath}"`);

    const child = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || `Command failed: ${cmd}`));
      return resolve();
    });
  });
}

function hasOpenCVWork(options = {}) {
  const cv = options.opencv || {};
  const sharpenAmount = Number(cv.sharpen_amount ?? (cv.sharpen ? 1 : 0));
  const denoiseH = Number(cv.denoise_h ?? (cv.denoise ? 6 : 0));
  return Boolean(
    sharpenAmount > 0 || denoiseH > 0 ||
    Number(cv.contrast || 1) !== 1 ||
    Number(cv.saturation || 1) !== 1 ||
    Number(cv.gamma || 1) !== 1
  );
}

function hasAnyEnhancement(options = {}) {
  return Boolean(
    options.upscale ||
    options.face_restore ||
    options.colorize ||
    options.resize ||
    hasOpenCVWork(options)
  );
}

function buildRestoreParams(options = {}) {
  const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  const upscale = toBool(options.upscale);
  const faceRestore = toBool(options.face_restore);
  const colorize = toBool(options.colorize);
  const cv = options.opencv || {};
  const sharpenAmount = Number(cv.sharpen_amount ?? (cv.sharpen ? 1 : 0));
  const denoiseH = Number(cv.denoise_h ?? (cv.denoise ? 6 : 0));
  const faceStrength = Number(options.face_strength);
  const processOrder = [];
  if (faceRestore) processOrder.push('gfpgan');
  if (upscale) processOrder.push('esrgan');
  if (colorize) processOrder.push('colorize');

  const params = new URLSearchParams({
    scale: upscale ? '4' : '1',
    facefix: faceRestore ? 'gfpgan_full' : 'none',
    format: 'jpg',
    post_filter: 'none',
    downsample_factor: '1',
    face_strength: String(Number.isFinite(faceStrength) && faceStrength > 0 ? faceStrength : 0.7),
    process_order: processOrder.join(',') || 'none',
    cv_enabled: 'true',
    cv_auto: 'false',
    cv_sharpen: String(Math.max(0, sharpenAmount || 0)),
    cv_contrast: String(cv.contrast ?? 1),
    cv_saturation: String(cv.saturation ?? 1),
    cv_gamma: String(cv.gamma ?? 1),
    cv_denoise_h: String(Math.max(0, Math.round(denoiseH || 0)))
  });
  // Some restore servers treat any non-empty string as truthy; omit colorize when off.
  if (colorize) params.set('colorize', 'true');
  const targetWidth = Number(options.target_width);
  const targetHeight = Number(options.target_height);
  if (Number.isFinite(targetWidth) && targetWidth > 0) {
    params.set('target_width', String(Math.round(targetWidth)));
  }
  if (Number.isFinite(targetHeight) && targetHeight > 0) {
    params.set('target_height', String(Math.round(targetHeight)));
  }
  return params;
}

async function writeStreamToFile(readable, outPath) {
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outPath);
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    readable.on('error', done);
    writer.on('error', done);
    // On Windows, wait for close to avoid file-lock races before reopening.
    writer.on('close', () => done());
    readable.pipe(writer);
  });
}

async function withRetry(fn, attempts = 5, delayMs = 140) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      const retryable = /UNKNOWN|open|EBUSY|EPERM|EACCES/i.test(msg);
      if (!retryable || i === attempts - 1) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function waitForReadableFile(filePath) {
  await withRetry(async () => {
    await fsp.access(filePath, fs.constants.R_OK);
    const st = await fsp.stat(filePath);
    if (!st.size) throw new Error(`File not ready: ${filePath}`);
  }, 8, 180);
}

async function processViaRestoreApi(inputPath, outputPath, options = {}, onProgress = () => {}) {
  onProgress(10, 'Submitting restore job');
  const apiOptions = { ...options };
  const inDims = await readDims(inputPath);
  if (inDims.width && inDims.height) {
    const reqW = toPositiveInt(apiOptions.target_width);
    const reqH = toPositiveInt(apiOptions.target_height);
    if (apiOptions.upscale) {
      apiOptions.target_width = inDims.width * 4;
      apiOptions.target_height = inDims.height * 4;
    } else if (apiOptions.resize && reqW) {
      apiOptions.target_width = reqW;
      apiOptions.target_height = reqH || null;
    } else {
      // No resize selected: force original dimensions.
      apiOptions.target_width = inDims.width;
      apiOptions.target_height = inDims.height;
    }
  }
  const params = buildRestoreParams(apiOptions);
  if (String(process.env.DEBUG_RESTORE_PARAMS || '').toLowerCase() === 'true') {
    // Helpful when validating toggle behavior against restore API.
    // eslint-disable-next-line no-console
    console.log('[restore-api] params:', params.toString());
  }
  const form = new FormData();
  form.append('file', fs.createReadStream(inputPath));

  const submitResp = await axios.post(
    `${RESTORE_API_BASE}/api/restore/?${params.toString()}`,
    form,
    { headers: form.getHeaders(), timeout: 60_000 }
  );

  const jobId = submitResp.data?.job_id;
  if (!jobId) throw new Error('No job_id returned from restore server');
  onProgress(20, 'Restore job accepted');

  const axiosNoKeepAlive = axios.create({
    httpAgent: new http.Agent({ keepAlive: false }),
    httpsAgent: new https.Agent({ keepAlive: false })
  });

  let finished = false;
  for (let i = 0; i < 120; i += 1) {
    try {
      const statusResp = await axiosNoKeepAlive.get(`${RESTORE_API_BASE}/api/status/${jobId}`, { timeout: 30_000 });
      const status = String(statusResp.data?.status || '').toLowerCase();
      const remoteProgress = Number(statusResp.data?.progress);
      const fallbackProgress = 20 + Math.min(60, Math.floor((i / 120) * 60));
      onProgress(
        Number.isFinite(remoteProgress) ? Math.max(20, Math.min(80, Math.floor(remoteProgress))) : fallbackProgress,
        statusResp.data?.status || 'Processing'
      );
      if (status.startsWith('done')) {
        finished = true;
        break;
      }
      if (status.startsWith('error')) throw new Error('Restore job failed');
    } catch (error) {
      if (i === 119) throw error;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  if (!finished) throw new Error('Restore job did not finish');

  onProgress(85, 'Downloading result');
  const downloadResp = await axios.get(`${RESTORE_API_BASE}/api/download/${jobId}?stage=final`, {
    responseType: 'stream',
    timeout: 60_000
  });
  await writeStreamToFile(downloadResp.data, outputPath);

  await axios.delete(`${RESTORE_API_BASE}/api/cleanup/${jobId}`).catch(() => {});
  onProgress(92, 'Result ready');
}

async function applyOpenCV(inputPath, outputPath, options = {}) {
  const python = process.env.PYTHON_BIN || 'python';
  const script = path.join(__dirname, '..', 'scripts', 'opencv_enhance.py');
  const args = [
    script,
    '--input', inputPath,
    '--output', outputPath,
    '--contrast', String(options.contrast ?? 1.0),
    '--saturation', String(options.saturation ?? 1.0),
    '--gamma', String(options.gamma ?? 1.0),
    '--sharpen_amount', String(Number(options.sharpen_amount ?? (options.sharpen ? 1 : 0))),
    '--denoise_h', String(Math.max(0, Math.round(Number(options.denoise_h ?? (options.denoise ? 6 : 0)))))
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || 'OpenCV enhancement failed'));
      return resolve();
    });
  });
}

async function applyResize(inputPath, outputPath, options = {}) {
  const width = Number(options.target_width);
  const height = Number(options.target_height);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error('Resize requires valid target_width');
  }
  if (Number.isFinite(height) && height > 0) {
    await sharp(inputPath).resize(Math.round(width), Math.round(height), { fit: 'fill' }).toFile(outputPath);
    return;
  }

  // Height "auto": preserve original aspect ratio from source image.
  await sharp(inputPath).resize(Math.round(width), null, { fit: 'inside', withoutEnlargement: false }).toFile(outputPath);
}

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

async function readDims(imagePath) {
  const meta = await withRetry(() => sharp(imagePath).metadata());
  return {
    width: toPositiveInt(meta.width),
    height: toPositiveInt(meta.height)
  };
}

async function enforceOutputDimensions(inputPath, outputPath, options = {}) {
  let targetWidth = null;
  let targetHeight = null;
  const inDims = await readDims(inputPath);
  if (!inDims.width || !inDims.height) return;

  if (options.resize) {
    targetWidth = toPositiveInt(options.target_width);
    targetHeight = toPositiveInt(options.target_height);
    if (!targetWidth) return;
  } else if (options.upscale) {
    targetWidth = inDims.width * 4;
    targetHeight = inDims.height * 4;
  } else {
    // No resize options selected: keep dimensions unchanged.
    targetWidth = inDims.width;
    targetHeight = inDims.height;
  }

  const outDims = await readDims(outputPath);
  if (!outDims.width || !outDims.height) return;

  const widthMatches = outDims.width === targetWidth;
  const heightMatches = targetHeight ? outDims.height === targetHeight : true;
  if (widthMatches && heightMatches) return;

  const sourceBuffer = await withRetry(() => fsp.readFile(outputPath));
  let resizedBuffer;
  if (targetHeight) {
    resizedBuffer = await withRetry(() => sharp(sourceBuffer)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .jpeg({ quality: 95 })
      .toBuffer());
  } else {
    resizedBuffer = await withRetry(() => sharp(sourceBuffer)
      .resize(targetWidth, null, { fit: 'inside', withoutEnlargement: false })
      .jpeg({ quality: 95 })
      .toBuffer());
  }
  await withRetry(() => fsp.writeFile(outputPath, resizedBuffer));
}

async function processImagePipeline({ inputPath, outputPath, options, onProgress = () => {} }) {
  if (RESTORE_API_BASE && hasAnyEnhancement(options)) {
    await processViaRestoreApi(inputPath, outputPath, options, onProgress);
    await waitForReadableFile(outputPath);
    onProgress(98, 'Applying final dimensions');
    await enforceOutputDimensions(inputPath, outputPath, options);
    onProgress(100, 'Completed');
    return;
  }

  let current = inputPath;
  onProgress(10, 'Preparing pipeline');
  const steps = [];
  if (options.colorize) steps.push('colorize');
  if (options.face_restore) steps.push('face_restore');
  if (options.upscale) steps.push('upscale');
  if (options.resize) steps.push('resize');
  if (hasOpenCVWork(options)) steps.push('opencv');
  const totalSteps = Math.max(steps.length, 1);
  let completedSteps = 0;
  const tick = (label) => {
    completedSteps += 1;
    const p = Math.min(95, 10 + Math.floor((completedSteps / totalSteps) * 80));
    onProgress(p, label);
  };

  if (options.colorize) {
    if (!process.env.DEOLDIFY_CMD) throw new Error('Set ESRGAN_URL for API mode or DEOLDIFY_CMD for local mode');
    const colorized = `${outputPath}.colorized.jpg`;
    await runCommand(process.env.DEOLDIFY_CMD, current, colorized);
    current = colorized;
    tick('Colorization done');
  }

  if (options.face_restore) {
    if (!process.env.GFPGAN_CMD) throw new Error('Set ESRGAN_URL for API mode or GFPGAN_CMD for local mode');
    const faced = `${outputPath}.face.jpg`;
    await runCommand(process.env.GFPGAN_CMD, current, faced);
    current = faced;
    tick('Face restoration done');
  }

  if (options.upscale) {
    if (!process.env.REALESRGAN_CMD) throw new Error('Set ESRGAN_URL for API mode or REALESRGAN_CMD for local mode');
    const upscaled = `${outputPath}.upscaled.jpg`;
    await runCommand(process.env.REALESRGAN_CMD, current, upscaled);
    current = upscaled;
    tick('Upscaling done');
  }

  if (options.resize) {
    const resizeOut = `${outputPath}.resize.jpg`;
    await applyResize(current, resizeOut, options);
    current = resizeOut;
    tick('Resize done');
  }

  if (hasOpenCVWork(options)) {
    const cvOut = `${outputPath}.opencv.jpg`;
    await applyOpenCV(current, cvOut, options.opencv || {});
    current = cvOut;
    tick('OpenCV enhancement done');
  }

  onProgress(98, 'Saving result');
  await fsp.copyFile(current, outputPath);
  await enforceOutputDimensions(inputPath, outputPath, options);
  onProgress(100, 'Completed');
}

module.exports = { processImagePipeline };
