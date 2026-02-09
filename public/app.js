async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const ctype = res.headers.get('content-type') || '';
  const body = ctype.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error((body && (body.error || body.message)) || `HTTP ${res.status}`);
  return body;
}

const state = {
  uploadedPreviewUrl: '',
  completedPreviewUrl: '',
  pendingEnhancedPath: '',
  suppressExistingEnhancedPreview: false,
  selectedImageId: null,
  selectedVersions: {},
  images: [],
  beforeBytes: null,
  afterBytes: null,
  beforeDims: null,
  afterDims: null
};

const statusEl = document.getElementById('status');
const noticeModalEl = document.getElementById('noticeModal');
const noticeMessageEl = document.getElementById('noticeMessage');
const noticeCloseEl = document.getElementById('noticeClose');
const confirmModalEl = document.getElementById('confirmModal');
const confirmMessageEl = document.getElementById('confirmMessage');
const confirmCancelEl = document.getElementById('confirmCancel');
const confirmOkEl = document.getElementById('confirmOk');
const registerModalEl = document.getElementById('registerModal');
const registerEmailEl = document.getElementById('registerEmail');
const registerPasswordEl = document.getElementById('registerPassword');
const registerPasswordConfirmEl = document.getElementById('registerPasswordConfirm');
const registerMessageEl = document.getElementById('registerMessage');
const registerCancelEl = document.getElementById('registerCancel');
const registerSubmitEl = document.getElementById('registerSubmit');
const forcePasswordModalEl = document.getElementById('forcePasswordModal');
const forceCurrentPasswordEl = document.getElementById('forceCurrentPassword');
const forceNewPasswordEl = document.getElementById('forceNewPassword');
const forceConfirmPasswordEl = document.getElementById('forceConfirmPassword');
const forcePasswordSubmitEl = document.getElementById('forcePasswordSubmit');
const forcePasswordLogoutEl = document.getElementById('forcePasswordLogout');
const uploadedPreviewEl = document.getElementById('uploadedPreview');
const completedPreviewEl = document.getElementById('completedPreview');
const authGuestEl = document.getElementById('authGuest');
const authUserEl = document.getElementById('authUser');
const registerBtnEl = document.getElementById('register');
const authMessageEl = document.getElementById('authMessage');
const accountLabelEl = document.getElementById('accountLabel');
const adminLinkEl = document.getElementById('adminLink');
const authOnlyEls = Array.from(document.querySelectorAll('.auth-only'));
const beforeSizeEl = document.getElementById('beforeSize');
const afterSizeEl = document.getElementById('afterSize');
const contrastEl = document.getElementById('contrast');
const saturationEl = document.getElementById('saturation');
const gammaEl = document.getElementById('gamma');
const resizeEl = document.getElementById('resize');
const upscaleEl = document.getElementById('upscale');
const faceStrengthEl = document.getElementById('faceStrength');
const targetWidthEl = document.getElementById('targetWidth');
const targetHeightEl = document.getElementById('targetHeight');
const sharpenEl = document.getElementById('sharpen');
const denoiseEl = document.getElementById('denoise');
const contrastValueEl = document.getElementById('contrastValue');
const saturationValueEl = document.getElementById('saturationValue');
const gammaValueEl = document.getElementById('gammaValue');
const sharpenValueEl = document.getElementById('sharpenValue');
const denoiseValueEl = document.getElementById('denoiseValue');
const faceStrengthValueEl = document.getElementById('faceStrengthValue');
const progressWrapEl = document.getElementById('progressWrap');
const progressBarEl = document.getElementById('progressBar');
const progressLabelEl = document.getElementById('progressLabel');
const progressPercentEl = document.getElementById('progressPercent');
const enhanceModalEl = document.getElementById('enhanceModal');
const closeEnhanceModalEl = document.getElementById('closeEnhanceModal');
const resetAdjustmentsBtnEl = document.getElementById('resetAdjustmentsBtn');
const useEnhancedBtnEl = document.getElementById('useEnhancedBtn');
const photoInputEl = document.getElementById('photo');
const cropModalEl = document.getElementById('cropModal');
const cropImageEl = document.getElementById('cropImage');
const cropPreviewEl = document.getElementById('cropPreview');
const cropCancelEl = document.getElementById('cropCancel');
const cropApplyEl = document.getElementById('cropApply');
const cropUseOriginalEl = document.getElementById('cropUseOriginal');
const socket = window.io ? window.io({ withCredentials: true }) : null;
let socketId = null;
let cropper = null;
let pendingUploadFile = null;
let pendingResizeDefaultsFromOriginal = false;
let isRefreshingImages = false;
let progressHideTimer = null;
const versionMenuState = {
  imageId: null,
  versionNum: null,
  filePath: '',
  sizeBytes: null,
  hideTimer: null
};
const versionContextMenuEl = document.createElement('div');
versionContextMenuEl.className = 'version-context-menu';
versionContextMenuEl.hidden = true;
versionContextMenuEl.innerHTML = `
  <button type="button" data-action="view">View</button>
  <button type="button" data-action="download">Download</button>
  <button type="button" data-action="delete" class="danger">Delete</button>
  <div class="version-context-meta" data-meta>Size: - | Resolution: -</div>
`;
document.body.appendChild(versionContextMenuEl);
const versionViewModalEl = document.createElement('div');
versionViewModalEl.className = 'version-view-modal';
versionViewModalEl.hidden = true;
versionViewModalEl.innerHTML = `
  <div class="version-view-dialog">
    <button type="button" class="version-view-close" aria-label="Close">×</button>
    <img class="version-view-image" alt="Version image preview" />
  </div>
`;
document.body.appendChild(versionViewModalEl);
const versionViewImageEl = versionViewModalEl.querySelector('.version-view-image');
const versionViewCloseEl = versionViewModalEl.querySelector('.version-view-close');
const versionMenuDeleteBtnEl = versionContextMenuEl.querySelector('button[data-action="delete"]');
const versionMenuMetaEl = versionContextMenuEl.querySelector('[data-meta]');
const imageDimsCache = new Map();
let confirmResolver = null;
let forcePasswordRequired = false;

function syncUseEnhancedButton() {
  if (!useEnhancedBtnEl) return;
  useEnhancedBtnEl.disabled = !state.pendingEnhancedPath;
}

function setProgress(progress, message = 'Processing...') {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  if (progressHideTimer) {
    window.clearTimeout(progressHideTimer);
    progressHideTimer = null;
  }
  progressWrapEl.hidden = false;
  progressBarEl.style.width = `${pct}%`;
  progressPercentEl.textContent = `${pct}%`;
  progressLabelEl.textContent = message;
  if (pct >= 100) {
    progressHideTimer = window.setTimeout(() => {
      resetProgress();
    }, 450);
  }
}

function resetProgress() {
  if (progressHideTimer) {
    window.clearTimeout(progressHideTimer);
    progressHideTimer = null;
  }
  progressWrapEl.hidden = true;
  progressBarEl.style.width = '0%';
  progressPercentEl.textContent = '0%';
  progressLabelEl.textContent = 'Processing...';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatSizeLine(bytes, dims) {
  const bytePart = formatBytes(bytes);
  const dimPart = dims ? `${dims.width}x${dims.height}px` : '-';
  return `Size: ${bytePart} | Resolution: ${dimPart}`;
}

function formatUploadedAt(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString();
}

function getImageNameById(imageId) {
  const n = Number(imageId);
  const row = state.images.find((x) => Number(x.id) === n);
  return row?.original_name || `image #${n}`;
}

function updatePreviewSizeLabels() {
  beforeSizeEl.textContent = formatSizeLine(state.beforeBytes, state.beforeDims);
  afterSizeEl.textContent = formatSizeLine(state.afterBytes, state.afterDims);
}

function updateSliderLabels() {
  faceStrengthValueEl.textContent = Number(faceStrengthEl.value || 0.7).toFixed(1);
  contrastValueEl.textContent = Number(contrastEl.value || 1).toFixed(1);
  saturationValueEl.textContent = Number(saturationEl.value || 1).toFixed(1);
  gammaValueEl.textContent = Number(gammaEl.value || 1).toFixed(1);
  sharpenValueEl.textContent = Number(sharpenEl.value || 0).toFixed(1);
  denoiseValueEl.textContent = String(Math.round(Number(denoiseEl.value || 0)));
}

function syncResizeInputs() {
  const enabled = resizeEl.checked;
  targetWidthEl.disabled = !enabled;
  targetHeightEl.disabled = !enabled;
}

function applyResizeSuggestedDimensions() {
  if (!state.beforeDims) return;
  if (upscaleEl.checked) {
    targetWidthEl.value = String(Math.max(1, Math.round(state.beforeDims.width * 4)));
    targetHeightEl.value = String(Math.max(1, Math.round(state.beforeDims.height * 4)));
    return;
  }
  if (resizeEl.checked) {
    targetWidthEl.value = String(Math.max(1, Math.round(state.beforeDims.width * 2)));
    targetHeightEl.value = 'auto';
    return;
  }
  targetWidthEl.value = String(Math.max(1, Math.round(state.beforeDims.width)));
  targetHeightEl.value = String(Math.max(1, Math.round(state.beforeDims.height)));
}

function resetEnhanceAdjustments() {
  upscaleEl.checked = false;
  document.getElementById('face').checked = true;
  document.getElementById('colorize').checked = false;
  resizeEl.checked = false;
  faceStrengthEl.value = '0.7';
  contrastEl.value = '1';
  saturationEl.value = '1';
  gammaEl.value = '1';
  sharpenEl.value = '0';
  denoiseEl.value = '0';
  applyResizeSuggestedDimensions();
  syncResizeInputs();
  updateSliderLabels();
}

function openEnhanceModal() {
  if (!state.selectedImageId) return;
  resetEnhanceAdjustments();
  syncResizeInputs();
  enhanceModalEl.hidden = false;
}

function closeEnhanceModal() {
  enhanceModalEl.hidden = true;
  state.suppressExistingEnhancedPreview = false;
  resetProgress();
}

function setAuthUI(user) {
  const loggedIn = Boolean(user && user.email);
  const role = (user && user.role) ? String(user.role).toLowerCase() : 'user';
  forcePasswordRequired = Boolean(user && user.force_password_change);
  authGuestEl.hidden = loggedIn;
  authUserEl.hidden = !loggedIn;
  if (registerBtnEl) registerBtnEl.hidden = loggedIn;
  if (authMessageEl) {
    authMessageEl.hidden = loggedIn;
    if (loggedIn) authMessageEl.textContent = '';
  }
  authGuestEl.style.display = loggedIn ? 'none' : 'grid';
  authUserEl.style.display = loggedIn ? 'flex' : 'none';
  accountLabelEl.textContent = loggedIn ? `Signed in as ${user.email}` : '';
  if (adminLinkEl) adminLinkEl.hidden = !(loggedIn && role === 'admin');
  authOnlyEls.forEach((el) => {
    el.hidden = !loggedIn || forcePasswordRequired;
  });
  if (!loggedIn) resetProgress();
  if (!loggedIn) {
    closeEnhanceModal();
    pendingUploadFile = null;
    photoInputEl.value = '';
  }
  if (loggedIn && forcePasswordRequired) {
    forcePasswordModalEl.hidden = false;
    forceCurrentPasswordEl.value = '';
    forceNewPasswordEl.value = '';
    forceConfirmPasswordEl.value = '';
    forceCurrentPasswordEl.focus();
  } else if (forcePasswordModalEl) {
    forcePasswordModalEl.hidden = true;
  }
}

function log(msg, options = {}) {
  const text = String(msg);
  if (statusEl) statusEl.textContent = text;
  if (!options.popup) return;
  if (!noticeModalEl || !noticeMessageEl) return;
  noticeMessageEl.textContent = text;
  noticeModalEl.hidden = false;
}

function closeNoticeModal() {
  if (!noticeModalEl) return;
  noticeModalEl.hidden = true;
}

function askConfirm(message) {
  if (!confirmModalEl || !confirmMessageEl) return Promise.resolve(false);
  if (confirmResolver) {
    confirmResolver(false);
    confirmResolver = null;
  }
  confirmMessageEl.textContent = String(message || 'Are you sure?');
  confirmModalEl.hidden = false;
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function settleConfirm(answer) {
  if (!confirmModalEl) return;
  confirmModalEl.hidden = true;
  if (!confirmResolver) return;
  const resolve = confirmResolver;
  confirmResolver = null;
  resolve(Boolean(answer));
}

function openRegisterModal() {
  document.getElementById('email').value = '';
  document.getElementById('password').value = '';
  if (authMessageEl) {
    authMessageEl.textContent = '';
    authMessageEl.hidden = true;
  }
  registerEmailEl.value = '';
  registerPasswordEl.value = '';
  registerPasswordConfirmEl.value = '';
  registerMessageEl.textContent = '';
  registerMessageEl.hidden = true;
  registerModalEl.hidden = false;
  registerEmailEl.focus();
}

function closeRegisterModal() {
  registerModalEl.hidden = true;
}

function setPreview(imgEl, src) {
  imgEl.src = src || '';
  imgEl.style.display = src ? 'block' : 'none';
}

function activateEnhancePreview() {
  openEnhanceModal();
}

function renderPreviews() {
  state.beforeDims = null;
  state.afterDims = null;
  setPreview(uploadedPreviewEl, state.uploadedPreviewUrl);
  setPreview(completedPreviewEl, state.completedPreviewUrl);
  updatePreviewSizeLabels();
  syncUseEnhancedButton();
}

function setSelectedImage(image, options = {}) {
  if (!image) return;
  const showCurrentAsEnhanced = options.showCurrentAsEnhanced !== false;
  const preservePendingPreview = options.preservePendingPreview === true;
  const pendingPreviewPath = preservePendingPreview ? state.pendingEnhancedPath : '';
  state.selectedImageId = image.id;
  state.uploadedPreviewUrl = image.original_path || image.current_path || '';
  const hasProcessedVersion = Number(image.current_version || 1) > 1;
  const shouldShowCurrentEnhanced = showCurrentAsEnhanced && !state.suppressExistingEnhancedPreview;
  if (pendingPreviewPath) {
    state.completedPreviewUrl = pendingPreviewPath;
  } else {
    state.completedPreviewUrl = (shouldShowCurrentEnhanced && hasProcessedVersion) ? (image.current_path || '') : '';
  }
  state.beforeBytes = image.original_size_bytes || image.current_size_bytes;
  if (!pendingPreviewPath) {
    state.afterBytes = (shouldShowCurrentEnhanced && hasProcessedVersion) ? image.current_size_bytes : null;
  }
  if (!preservePendingPreview) state.pendingEnhancedPath = '';
  pendingResizeDefaultsFromOriginal = true;
  renderPreviews();
}

function getSelectedVersions(imageId) {
  const key = String(imageId);
  if (!state.selectedVersions[key]) state.selectedVersions[key] = new Set();
  return state.selectedVersions[key];
}

function toggleVersionSelection(imageId, versionNum) {
  const selected = getSelectedVersions(imageId);
  if (selected.has(versionNum)) {
    selected.clear();
    return;
  }
  selected.clear();
  selected.add(versionNum);
}

function downloadImage(imageId, versions = []) {
  const selected = [...versions].map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (selected.length <= 1) {
    const one = selected[0];
    const query = Number.isFinite(one) ? `?version=${encodeURIComponent(one)}` : '';
    window.location.href = `/api/images/${imageId}/download${query}`;
    return;
  }

  selected.sort((a, b) => a - b);
  selected.forEach((version, index) => {
    window.setTimeout(() => {
      const link = document.createElement('a');
      link.href = `/api/images/${imageId}/download?version=${encodeURIComponent(version)}`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }, index * 220);
  });
}

function clearVersionMenuHideTimer() {
  if (!versionMenuState.hideTimer) return;
  window.clearTimeout(versionMenuState.hideTimer);
  versionMenuState.hideTimer = null;
}

function scheduleHideVersionMenu() {
  clearVersionMenuHideTimer();
  versionMenuState.hideTimer = window.setTimeout(() => {
    versionContextMenuEl.hidden = true;
  }, 420);
}

function hideVersionMenu() {
  clearVersionMenuHideTimer();
  versionContextMenuEl.hidden = true;
  versionMenuState.imageId = null;
  versionMenuState.versionNum = null;
  versionMenuState.filePath = '';
  versionMenuState.sizeBytes = null;
}

function loadImageDimensions(filePath) {
  if (!filePath) return Promise.resolve(null);
  if (imageDimsCache.has(filePath)) return Promise.resolve(imageDimsCache.get(filePath));
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => {
      const dims = { width: probe.naturalWidth, height: probe.naturalHeight };
      imageDimsCache.set(filePath, dims);
      resolve(dims);
    };
    probe.onerror = () => resolve(null);
    probe.src = filePath;
  });
}

function openVersionViewModal(filePath) {
  if (!filePath) return;
  versionViewImageEl.src = filePath;
  versionViewModalEl.hidden = false;
}

function closeVersionViewModal() {
  versionViewModalEl.hidden = true;
  versionViewImageEl.src = '';
}

function showVersionMenu(imageId, versionNum, filePath, sizeBytes, event) {
  versionMenuState.imageId = Number(imageId);
  versionMenuState.versionNum = Number(versionNum);
  versionMenuState.filePath = filePath || '';
  versionMenuState.sizeBytes = Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : null;
  if (versionMenuDeleteBtnEl) {
    versionMenuDeleteBtnEl.hidden = Number(versionNum) <= 1;
  }
  if (versionMenuMetaEl) {
    versionMenuMetaEl.textContent = `Size: ${formatBytes(versionMenuState.sizeBytes)} | Resolution: loading...`;
  }

  const menuW = 140;
  const menuH = 108;
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const margin = 8;

  const target = event?.currentTarget || event?.target;
  const rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
  let x;
  let y;

  if (rect) {
    x = rect.left + Math.max(0, Math.round((rect.width - menuW) / 2));
    y = rect.bottom + 8;
  } else {
    x = (event?.clientX || 16) + 14;
    y = (event?.clientY || 16) + 14;
  }

  if (x + menuW + margin > vw) x = Math.max(margin, vw - menuW - margin);
  if (y + menuH + margin > vh && rect) y = Math.max(margin, rect.top - menuH - 8);
  if (y + menuH + margin > vh) y = Math.max(margin, vh - menuH - margin);
  x = Math.max(margin, Math.min(x, Math.max(margin, vw - menuW - margin)));
  y = Math.max(margin, Math.min(y, Math.max(margin, vh - menuH - margin)));

  versionContextMenuEl.style.left = `${x}px`;
  versionContextMenuEl.style.top = `${y}px`;
  versionContextMenuEl.hidden = false;

  loadImageDimensions(filePath).then((dims) => {
    if (!versionMenuMetaEl) return;
    if (versionMenuState.filePath !== filePath || versionContextMenuEl.hidden) return;
    const sizeText = formatBytes(versionMenuState.sizeBytes);
    if (!dims) {
      versionMenuMetaEl.textContent = `Size: ${sizeText} | Resolution: -`;
      return;
    }
    versionMenuMetaEl.textContent = `Size: ${sizeText} | Resolution: ${dims.width}x${dims.height}px`;
  });
}

function openCropModal(imageUrl) {
  if (!window.Cropper) {
    pendingUploadFile = photoInputEl.files[0] || null;
    if (pendingUploadFile) {
      state.uploadedPreviewUrl = URL.createObjectURL(pendingUploadFile);
      state.beforeBytes = pendingUploadFile.size;
      renderPreviews();
    }
    return;
  }

  cropImageEl.src = imageUrl;
  cropModalEl.hidden = false;

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  cropper = new window.Cropper(cropImageEl, {
    viewMode: 1,
    autoCropArea: 0.9,
    dragMode: 'move',
    preview: cropPreviewEl,
    responsive: true
  });
}

function closeCropModal() {
  cropModalEl.hidden = true;
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

async function deleteImage(imageId) {
  const imageName = getImageNameById(imageId);
  const ok = await askConfirm(`Delete "${imageName}"? This cannot be undone.`);
  if (!ok) return;

  await api(`/api/images/${imageId}`, { method: 'DELETE' });

  if (state.selectedImageId === imageId) {
    state.selectedImageId = null;
    state.uploadedPreviewUrl = '';
    state.completedPreviewUrl = '';
    state.beforeBytes = null;
    state.afterBytes = null;
    renderPreviews();
  }

  await refreshImages();
  log(`Deleted "${imageName}"`, { popup: true });
}

async function deleteSelectedEnhancedVersions(imageId, versions = []) {
  const selectedEnhanced = [...versions]
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 1);
  if (!selectedEnhanced.length) {
    throw new Error('Select one or more enhanced versions (2+) first.');
  }

  const ok = await askConfirm(`Delete selected enhanced versions: ${selectedEnhanced.sort((a, b) => a - b).join(', ')} ?`);
  if (!ok) return;

  await api(`/api/images/${imageId}/versions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versions: selectedEnhanced })
  });

  const selectedSet = getSelectedVersions(imageId);
  selectedEnhanced.forEach((v) => selectedSet.delete(v));
  await refreshImages();
  log(`Deleted ${selectedEnhanced.length} selected enhanced version(s).`, { popup: true });
}

async function deleteAllEnhancedVersions(imageId) {
  const ok = await askConfirm('Delete all enhanced versions and keep only original image?');
  if (!ok) return;

  await api(`/api/images/${imageId}/enhanced`, { method: 'DELETE' });

  const selectedSet = getSelectedVersions(imageId);
  selectedSet.clear();
  await refreshImages();
  log('Deleted all enhanced versions.', { popup: true });
}

function renderImageList() {
  const list = document.getElementById('images');
  list.innerHTML = '';

  state.images.forEach((row) => {
    const li = document.createElement('li');

    const metaWrap = document.createElement('div');
    metaWrap.className = 'image-meta';
    const topRow = document.createElement('div');
    topRow.className = 'image-top-row';

    const icon = document.createElement('span');
    icon.className = 'image-icon';
    const iconImg = document.createElement('img');
    iconImg.alt = row.original_name || `image-${row.id}`;
    iconImg.src = row.original_path || row.current_path || '';
    iconImg.loading = 'lazy';
    iconImg.onerror = () => {
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM7 9a2 2 0 1 0 0.001 0zM6 17h12l-4-5-3 4-2-2z"/></svg>';
    };
    icon.appendChild(iconImg);

    const meta = document.createElement('span');
    meta.className = 'image-caption';
    meta.textContent = `${row.original_name} | size ${formatBytes(row.current_size_bytes)} | uploaded ${formatUploadedAt(row.created_at)}`;
    topRow.appendChild(icon);

    const versions = document.createElement('div');
    versions.className = 'version-row';
    const versionTitle = document.createElement('span');
    versionTitle.className = 'version-title';
    versionTitle.textContent = 'Versions:';
    versions.appendChild(versionTitle);
    (row.versions || []).forEach((v) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'version-chip';
      chip.textContent = String(v.version_num);
      chip.onmouseenter = (e) => {
        clearVersionMenuHideTimer();
        showVersionMenu(row.id, v.version_num, v.file_path, v.size_bytes, e);
      };
      chip.onmouseleave = () => {
        scheduleHideVersionMenu();
      };
      chip.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openVersionViewModal(v.file_path);
      };
      chip.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showVersionMenu(row.id, v.version_num, v.file_path, v.size_bytes, e);
      };
      versions.appendChild(chip);
    });
    if (!row.versions || row.versions.length === 0) {
      const noVersion = document.createElement('span');
      noVersion.className = 'version-empty';
      noVersion.textContent = '1';
      versions.appendChild(noVersion);
    }

    topRow.appendChild(versions);
    metaWrap.appendChild(topRow);
    metaWrap.appendChild(meta);
    metaWrap.onclick = () => setSelectedImage(row);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'ghost';
    restoreBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6V3L8 7l4 4V8c2.8 0 5 2.2 5 5a5 5 0 0 1-5 5 5 5 0 0 1-4.9-4H5.1A7 7 0 0 0 12 20a7 7 0 0 0 0-14z"/></svg><span>Edit</span>';
    restoreBtn.onclick = () => {
      state.suppressExistingEnhancedPreview = true;
      setSelectedImage(row, { showCurrentAsEnhanced: false });
      openEnhanceModal();
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger ghost';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8l1 2h4v2H3V7h4l1-2zm1 6h2v8H9v-8zm4 0h2v8h-2v-8z"/></svg><span>Delete</span>';
    deleteBtn.onclick = () => deleteImage(row.id).catch((e) => log(e.message));
    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(metaWrap);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

document.getElementById('register').onclick = async () => {
  openRegisterModal();
};

registerSubmitEl.onclick = async () => {
  try {
    const email = registerEmailEl.value.trim();
    const password = registerPasswordEl.value;
    const confirmPassword = registerPasswordConfirmEl.value;
    if (!email) throw new Error('Email is required.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (password !== confirmPassword) throw new Error('Password confirmation does not match.');

    const data = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    log(`Registered: ${data.email}`, { popup: true });
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    closeRegisterModal();
    window.setTimeout(() => {
      window.location.reload();
    }, 250);
  } catch (e) {
    registerMessageEl.textContent = e.message || 'Register failed.';
    registerMessageEl.hidden = false;
  }
};
registerCancelEl.onclick = closeRegisterModal;

document.getElementById('login').onclick = async () => {
  try {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const data = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    setAuthUI(data.user || { email });
    if (!Boolean(data.user?.force_password_change)) {
      await refreshImages();
    }
    if (authMessageEl) {
      authMessageEl.textContent = '';
      authMessageEl.hidden = true;
    }
    log('Logged in');
  } catch (e) {
    if (authMessageEl) {
      authMessageEl.textContent = e.message || 'Login failed. Check your email and password, then try again.';
      authMessageEl.hidden = false;
    }
    log(e.message);
  }
};

document.getElementById('logout').onclick = async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    setAuthUI(null);
    state.images = [];
    state.selectedImageId = null;
    state.uploadedPreviewUrl = '';
    state.completedPreviewUrl = '';
    state.beforeBytes = null;
    state.afterBytes = null;
    state.pendingEnhancedPath = '';
    forcePasswordRequired = false;
    renderImageList();
    renderPreviews();
    log('Logged out');
  } catch (e) {
    log(e.message);
  }
};

async function uploadPendingOrSelectedFile() {
  const file = pendingUploadFile || photoInputEl.files[0];
  if (!file) throw new Error('Select an image first');

  const form = new FormData();
  form.append('photo', file);
  const data = await api('/api/images/upload', { method: 'POST', body: form });

  state.selectedImageId = data.imageId;
  state.completedPreviewUrl = '';
  state.afterBytes = null;
  state.pendingEnhancedPath = '';
  renderPreviews();
  pendingUploadFile = null;
  photoInputEl.value = '';

  log(`Uploaded "${file.name || 'image'}"`);
  await refreshImages();
}

document.getElementById('process').onclick = async () => {
  try {
    const imageId = Number(state.selectedImageId);
    if (!imageId) throw new Error('Select an image first from Your Images');
    setProgress(3, 'Starting job');
    const targetWidth = Number(targetWidthEl.value);
    const targetHeightRaw = String(targetHeightEl.value || '').trim().toLowerCase();
    let targetHeightValue = null;
    if (resizeEl.checked) {
      if (!Number.isFinite(targetWidth) || targetWidth <= 0) throw new Error('Width must be a positive number');
      if (targetHeightRaw !== '' && targetHeightRaw !== 'auto') {
        const targetHeight = Number(targetHeightRaw);
        if (!Number.isFinite(targetHeight) || targetHeight <= 0) throw new Error('Height must be a positive number or "auto"');
        targetHeightValue = Math.round(targetHeight);
      }
    }

    const payload = {
      socketId,
      upscale: upscaleEl.checked,
      face_restore: document.getElementById('face').checked,
      face_strength: Number(faceStrengthEl.value || 0.7),
      colorize: document.getElementById('colorize').checked,
      resize: resizeEl.checked,
      target_width: resizeEl.checked ? Math.round(targetWidth) : null,
      target_height: resizeEl.checked ? targetHeightValue : null,
      opencv: {
        sharpen_amount: Number(sharpenEl.value || 0),
        denoise_h: Math.round(Number(denoiseEl.value || 0)),
        contrast: Number(contrastEl.value || 1),
        saturation: Number(saturationEl.value || 1),
        gamma: Number(gammaEl.value || 1)
      }
    };

    const data = await api(`/api/images/${imageId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    state.selectedImageId = imageId;
    state.suppressExistingEnhancedPreview = false;
    state.completedPreviewUrl = data.preview_path || data.path || '';
    state.pendingEnhancedPath = data.preview_path || data.path || '';
    state.afterBytes = null;
    renderPreviews();
    setProgress(100, 'Completed');

    log('Preview generation is complete. Click "Save Enhanced Version" to save.');
  } catch (e) {
    setProgress(0, `Failed: ${e.message}`);
    log(e.message);
  }
};

async function refreshImages() {
  if (isRefreshingImages) return;
  isRefreshingImages = true;
  try {
  const data = await api('/api/images');
  const previousOrder = new Map(state.images.map((img, idx) => [Number(img.id), idx]));
  state.images = [...data].sort((a, b) => {
    const aIdx = previousOrder.has(Number(a.id)) ? previousOrder.get(Number(a.id)) : Number.MAX_SAFE_INTEGER;
    const bIdx = previousOrder.has(Number(b.id)) ? previousOrder.get(Number(b.id)) : Number.MAX_SAFE_INTEGER;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return 0;
  });
  renderImageList();

  if (state.selectedImageId) {
    const selected = state.images.find((x) => x.id === state.selectedImageId);
    if (selected) {
      const keepPendingPreview = !enhanceModalEl.hidden && Boolean(state.pendingEnhancedPath);
      setSelectedImage(selected, { preservePendingPreview: keepPendingPreview });
    }
  }

  if (!state.selectedImageId && state.images.length > 0) {
    setSelectedImage(state.images[0]);
  }
  } finally {
    isRefreshingImages = false;
  }
}

document.getElementById('refresh').onclick = async () => {
  try {
    await refreshImages();
    log('Library refreshed');
  } catch (e) {
    log(e.message);
  }
};

closeEnhanceModalEl.addEventListener('click', closeEnhanceModal);
resetAdjustmentsBtnEl.addEventListener('click', () => {
  resetEnhanceAdjustments();
  log('All enhancement settings reset to default.');
});
useEnhancedBtnEl.addEventListener('click', () => {
  const imageId = Number(state.selectedImageId);
  if (!imageId || !state.pendingEnhancedPath) {
    log('No pending enhanced preview to save.');
    closeEnhanceModal();
    return;
  }

  api(`/api/images/${imageId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preview_path: state.pendingEnhancedPath })
  })
    .then(async () => {
      state.pendingEnhancedPath = '';
      await refreshImages();
      closeEnhanceModal();
      log('Enhanced image saved.');
    })
    .catch((e) => log(e.message));
});

photoInputEl.addEventListener('change', () => {
  const file = photoInputEl.files[0];
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  openCropModal(objectUrl);
});

cropCancelEl.addEventListener('click', () => {
  closeCropModal();
  photoInputEl.value = '';
  pendingUploadFile = null;
});

cropApplyEl.addEventListener('click', () => {
  if (!cropper) return;
  const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const originalName = (photoInputEl.files[0] && photoInputEl.files[0].name) || 'cropped.jpg';
    pendingUploadFile = new File([blob], originalName, { type: blob.type || 'image/jpeg' });
    state.uploadedPreviewUrl = URL.createObjectURL(pendingUploadFile);
    state.beforeBytes = pendingUploadFile.size;
    state.completedPreviewUrl = '';
    state.afterBytes = null;
    pendingResizeDefaultsFromOriginal = true;
    renderPreviews();
    closeCropModal();
    uploadPendingOrSelectedFile().catch((e) => log(e.message));
  }, 'image/jpeg', 0.95);
});

cropUseOriginalEl.addEventListener('click', () => {
  const original = photoInputEl.files[0];
  if (!original) return;
  pendingUploadFile = original;
  state.uploadedPreviewUrl = URL.createObjectURL(original);
  state.beforeBytes = original.size;
  state.completedPreviewUrl = '';
  state.afterBytes = null;
  pendingResizeDefaultsFromOriginal = true;
  renderPreviews();
  closeCropModal();
  uploadPendingOrSelectedFile().catch((e) => log(e.message));
});

document.addEventListener('scroll', hideVersionMenu, true);
window.addEventListener('resize', hideVersionMenu);
document.addEventListener('click', (e) => {
  if (versionContextMenuEl.hidden) return;
  if (versionContextMenuEl.contains(e.target)) return;
  hideVersionMenu();
});
versionContextMenuEl.addEventListener('mouseenter', clearVersionMenuHideTimer);
versionContextMenuEl.addEventListener('mouseleave', scheduleHideVersionMenu);
versionContextMenuEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const action = btn.getAttribute('data-action');
  const imageId = Number(versionMenuState.imageId);
  const versionNum = Number(versionMenuState.versionNum);
  const filePath = versionMenuState.filePath;
  hideVersionMenu();

  try {
    if (!imageId || !versionNum) return;
    if (action === 'view') {
      if (!filePath) throw new Error('Version file is missing');
      openVersionViewModal(filePath);
      return;
    }
    if (action === 'download') {
      downloadImage(imageId, [versionNum]);
      return;
    }
    if (action === 'delete') {
      if (versionNum <= 1) throw new Error('Original version cannot be deleted here');
      const ok = await askConfirm(`Delete version ${versionNum}?`);
      if (!ok) return;
      await api(`/api/images/${imageId}/versions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versions: [versionNum] })
      });
      const selectedSet = getSelectedVersions(imageId);
      selectedSet.delete(versionNum);
      await refreshImages();
      log(`Deleted version ${versionNum}`, { popup: true });
    }
  } catch (err) {
    log(err.message || 'Version action failed');
  }
});

versionViewCloseEl.addEventListener('click', closeVersionViewModal);
versionViewModalEl.addEventListener('click', (e) => {
  if (e.target === versionViewModalEl) closeVersionViewModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !versionViewModalEl.hidden) closeVersionViewModal();
});

[faceStrengthEl, contrastEl, saturationEl, gammaEl, sharpenEl, denoiseEl].forEach((el) => {
  el.addEventListener('input', updateSliderLabels);
});
resizeEl.addEventListener('change', () => {
  if (resizeEl.checked) upscaleEl.checked = false;
  syncResizeInputs();
  applyResizeSuggestedDimensions();
});
upscaleEl.addEventListener('change', () => {
  if (upscaleEl.checked) resizeEl.checked = false;
  syncResizeInputs();
  applyResizeSuggestedDimensions();
});

uploadedPreviewEl.addEventListener('load', () => {
  state.beforeDims = { width: uploadedPreviewEl.naturalWidth, height: uploadedPreviewEl.naturalHeight };
  updatePreviewSizeLabels();
  if (pendingResizeDefaultsFromOriginal && state.beforeDims) {
    applyResizeSuggestedDimensions();
    pendingResizeDefaultsFromOriginal = false;
    syncResizeInputs();
  }
});

completedPreviewEl.addEventListener('load', () => {
  state.afterDims = { width: completedPreviewEl.naturalWidth, height: completedPreviewEl.naturalHeight };
  updatePreviewSizeLabels();
});

refreshImages().catch(() => {});
renderPreviews();
syncUseEnhancedButton();
updateSliderLabels();
resetEnhanceAdjustments();
syncResizeInputs();
setAuthUI(null);
api('/api/auth/me')
  .then(async (user) => {
    setAuthUI(user);
    if (!Boolean(user && user.force_password_change)) {
      await refreshImages();
    }
  })
  .catch(() => {});

if (socket) {
  socket.on('socket-ready', (payload) => {
    socketId = payload?.socketId || socket.id || null;
  });
  socket.on('connect', () => {
    socketId = socket.id || socketId;
  });
  socket.on('restore-progress', (event) => {
    if (!event) return;
    const activeImageId = Number(state.selectedImageId);
    if (activeImageId && Number(event.imageId) !== activeImageId) return;
    if (event.error) {
      setProgress(0, `Failed: ${event.message || 'Processing failed'}`);
      return;
    }
    setProgress(event.progress, event.message || 'Processing...');
  });
}

if (noticeCloseEl) {
  noticeCloseEl.addEventListener('click', closeNoticeModal);
}
if (noticeModalEl) {
  noticeModalEl.addEventListener('click', (e) => {
    if (e.target === noticeModalEl) closeNoticeModal();
  });
}
if (registerModalEl) {
  registerModalEl.addEventListener('click', (e) => {
    if (e.target === registerModalEl) closeRegisterModal();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && noticeModalEl && !noticeModalEl.hidden) closeNoticeModal();
  if (e.key === 'Escape' && confirmModalEl && !confirmModalEl.hidden) settleConfirm(false);
  if (e.key === 'Escape' && registerModalEl && !registerModalEl.hidden) closeRegisterModal();
});
if (confirmCancelEl) {
  confirmCancelEl.addEventListener('click', () => settleConfirm(false));
}
if (confirmOkEl) {
  confirmOkEl.addEventListener('click', () => settleConfirm(true));
}
if (confirmModalEl) {
  confirmModalEl.addEventListener('click', (e) => {
    if (e.target === confirmModalEl) settleConfirm(false);
  });
}

if (forcePasswordSubmitEl) {
  forcePasswordSubmitEl.addEventListener('click', async () => {
    try {
      const currentPassword = String(forceCurrentPasswordEl.value || '');
      const newPassword = String(forceNewPasswordEl.value || '');
      const confirmPassword = String(forceConfirmPasswordEl.value || '');
      if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.');
      if (newPassword !== confirmPassword) throw new Error('New password confirmation does not match.');
      await api('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      forcePasswordRequired = false;
      setAuthUI({ ...(await api('/api/auth/me')) });
      await refreshImages();
      log('Password updated successfully.');
    } catch (error) {
      log(error.message, { popup: true });
    }
  });
}
if (forcePasswordLogoutEl) {
  forcePasswordLogoutEl.addEventListener('click', () => {
    document.getElementById('logout').click();
  });
}
