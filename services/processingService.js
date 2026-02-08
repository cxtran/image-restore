const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

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
  return Boolean(
    cv.sharpen || cv.denoise ||
    Number(cv.contrast || 1) !== 1 ||
    Number(cv.saturation || 1) !== 1 ||
    Number(cv.gamma || 1) !== 1
  );
}

function hasAnyEnhancement(options = {}) {
  return Boolean(options.upscale || options.face_restore || options.colorize || hasOpenCVWork(options));
}

function buildRestoreParams(options = {}) {
  const cv = options.opencv || {};
  const processOrder = [];
  if (options.face_restore) processOrder.push('gfpgan');
  if (options.upscale) processOrder.push('esrgan');
  if (options.colorize) processOrder.push('colorize');

  return new URLSearchParams({
    scale: options.upscale ? '4' : '1',
    target_width: '1200',
    facefix: options.face_restore ? 'gfpgan' : 'none',
    colorize: options.colorize ? 'true' : 'false',
    format: 'jpg',
    post_filter: 'none',
    downsample_factor: '1',
    face_strength: '0.7',
    process_order: processOrder.join(',') || 'none',
    cv_enabled: 'true',
    cv_auto: 'false',
    cv_sharpen: cv.sharpen ? '1' : '0',
    cv_contrast: String(cv.contrast ?? 1),
    cv_saturation: String(cv.saturation ?? 1),
    cv_gamma: String(cv.gamma ?? 1),
    cv_denoise_h: cv.denoise ? '6' : '0'
  });
}

async function writeStreamToFile(readable, outPath) {
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outPath);
    readable.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function processViaRestoreApi(inputPath, outputPath, options = {}) {
  const params = buildRestoreParams(options);
  const form = new FormData();
  form.append('file', fs.createReadStream(inputPath));

  const submitResp = await axios.post(
    `${RESTORE_API_BASE}/api/restore/?${params.toString()}`,
    form,
    { headers: form.getHeaders(), timeout: 60_000 }
  );

  const jobId = submitResp.data?.job_id;
  if (!jobId) throw new Error('No job_id returned from restore server');

  const axiosNoKeepAlive = axios.create({
    httpAgent: new http.Agent({ keepAlive: false }),
    httpsAgent: new https.Agent({ keepAlive: false })
  });

  let finished = false;
  for (let i = 0; i < 120; i += 1) {
    try {
      const statusResp = await axiosNoKeepAlive.get(`${RESTORE_API_BASE}/api/status/${jobId}`, { timeout: 30_000 });
      const status = String(statusResp.data?.status || '').toLowerCase();
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

  const downloadResp = await axios.get(`${RESTORE_API_BASE}/api/download/${jobId}?stage=final`, {
    responseType: 'stream',
    timeout: 60_000
  });
  await writeStreamToFile(downloadResp.data, outputPath);

  await axios.delete(`${RESTORE_API_BASE}/api/cleanup/${jobId}`).catch(() => {});
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
    '--sharpen', String(Boolean(options.sharpen)),
    '--denoise', String(Boolean(options.denoise))
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

async function processImagePipeline({ inputPath, outputPath, options }) {
  if (RESTORE_API_BASE && hasAnyEnhancement(options)) {
    await processViaRestoreApi(inputPath, outputPath, options);
    return;
  }

  let current = inputPath;

  if (options.colorize) {
    if (!process.env.DEOLDIFY_CMD) throw new Error('Set ESRGAN_URL for API mode or DEOLDIFY_CMD for local mode');
    const colorized = `${outputPath}.colorized.jpg`;
    await runCommand(process.env.DEOLDIFY_CMD, current, colorized);
    current = colorized;
  }

  if (options.face_restore) {
    if (!process.env.GFPGAN_CMD) throw new Error('Set ESRGAN_URL for API mode or GFPGAN_CMD for local mode');
    const faced = `${outputPath}.face.jpg`;
    await runCommand(process.env.GFPGAN_CMD, current, faced);
    current = faced;
  }

  if (options.upscale) {
    if (!process.env.REALESRGAN_CMD) throw new Error('Set ESRGAN_URL for API mode or REALESRGAN_CMD for local mode');
    const upscaled = `${outputPath}.upscaled.jpg`;
    await runCommand(process.env.REALESRGAN_CMD, current, upscaled);
    current = upscaled;
  }

  if (hasOpenCVWork(options)) {
    const cvOut = `${outputPath}.opencv.jpg`;
    await applyOpenCV(current, cvOut, options.opencv || {});
    current = cvOut;
  }

  await fsp.copyFile(current, outputPath);
}

module.exports = { processImagePipeline };
