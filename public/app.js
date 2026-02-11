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
  sharedImages: [],
  showImageMetadata: false,
  beforeBytes: null,
  afterBytes: null,
  beforeDims: null,
  afterDims: null,
  currentUser: null
};

const LANG_KEY = 'ui_language';
const METADATA_VIS_KEY = 'show_image_metadata';
const SHARED_LAYOUT_KEY = 'shared_images_layout';
const SHARED_CAPTION_VIS_KEY = 'show_shared_captions';
const supportedLanguages = new Set(['en', 'vi']);
let currentLang = (() => {
  const saved = String(window.localStorage.getItem(LANG_KEY) || 'en').toLowerCase();
  return supportedLanguages.has(saved) ? saved : 'en';
})();
state.showImageMetadata = (() => {
  const saved = String(window.localStorage.getItem(METADATA_VIS_KEY) || '').toLowerCase();
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  return false;
})();
state.sharedLayout = (() => {
  const saved = String(window.localStorage.getItem(SHARED_LAYOUT_KEY) || '').toLowerCase();
  return saved === 'masonry' ? 'masonry' : 'tile';
})();
state.showSharedCaptions = (() => {
  const saved = String(window.localStorage.getItem(SHARED_CAPTION_VIS_KEY) || '').toLowerCase();
  if (saved === 'false') return false;
  return true;
})();

const i18n = {
  en: {
    title: 'Image Restore Studio',
    language: 'Language',
    account: 'Account',
    register: 'Register',
    email: 'Email',
    password: 'Password',
    showPassword: 'Show Password',
    hidePassword: 'Hide Password',
    login: 'Login',
    admin: 'Admin',
    logout: 'Logout',
    uploadImage: 'Upload Image',
    caption: 'Caption',
    captionPlaceholder: 'Image caption (optional)',
    showMetadata: 'Show Image Info',
    hideMetadata: 'Hide Image Info',
    showCaption: 'Show Caption',
    hideCaption: 'Hide Caption',
    layoutTile: 'Layout: Tile',
    layoutMasonry: 'Layout: Masonry',
    totalImages: 'Total Images: {count}',
    yourImages: 'Your Images',
    sharedImages: 'Shared Images',
    refreshLibrary: 'Refresh Library',
    notification: 'Notification',
    close: 'Close',
    confirmAction: 'Confirm Action',
    cancel: 'Cancel',
    confirm: 'Confirm',
    createAccount: 'Create Account',
    passwordMinHint: 'Password (min 8 chars)',
    confirmPassword: 'Confirm Password',
    changePasswordRequired: 'Change Password Required',
    forcePasswordHint: 'For security, you must change your temporary password before continuing.',
    currentPassword: 'Current Password',
    newPasswordMinHint: 'New Password (min 8 chars)',
    confirmNewPassword: 'Confirm New Password',
    updatePassword: 'Update Password',
    imageEnhancement: 'Image Enhancement',
    faceRestore: 'Face Restore',
    colorize: 'Colorize (DeOldify)',
    resize4x: 'Resize (4x)',
    resizeCustom: 'Resize (Custom)',
    width: 'Width',
    height: 'Height',
    auto: 'auto',
    faceStrength: 'Face Strength',
    sharpen: 'Sharpen',
    contrast: 'Contrast',
    saturation: 'Saturation',
    brightness: 'Brightness',
    denoise: 'Denoise',
    processing: 'Processing...',
    original: 'Original',
    enhanced: 'Enhanced',
    sizeLine: 'Size: {size} | Resolution: {resolution}',
    saveEnhancedVersion: 'Save Enhanced Version',
    resetAllSettings: 'Reset All Settings',
    generatePreview: 'Generate Preview',
    cropPreview: 'Preview',
    rotate: 'Rotate',
    rotateLeft: 'Rotate Left',
    rotateRight: 'Rotate Right',
    orientation: 'Orientation',
    applyCrop: 'Apply Crop',
    useOriginal: 'Use Original',
    signedInAs: 'Signed in as {email}',
    areYouSure: 'Are you sure?',
    imageNumber: 'image #{n}',
    view: 'View',
    share: 'Share',
    unshare: 'Unshare',
    shared: 'Shared',
    sharedBy: 'Shared by {email}',
    download: 'Download',
    delete: 'Delete',
    resolutionLoading: 'loading...',
    resolutionDash: '-',
    imageCaption: '{name} | size {size} | uploaded {time}',
    versions: 'Versions:',
    enhance: 'Enhance',
    editOriginal: 'Edit Original',
    emailRequired: 'Email is required.',
    passwordMin: 'Password must be at least 8 characters.',
    passwordConfirmMismatch: 'Password confirmation does not match.',
    registered: 'Registered: {email}',
    registerFailed: 'Register failed.',
    loggedIn: 'Logged in',
    loginFailed: 'Login failed. Check your email and password, then try again.',
    loggedOut: 'Logged out',
    selectImageFirst: 'Select an image first',
    selectImageFromList: 'Select an image first from Your Images',
    uploaded: 'Uploaded "{name}"',
    imageWord: 'image',
    startingJob: 'Starting job',
    widthPositive: 'Width must be a positive number',
    heightPositive: 'Height must be a positive number or "auto"',
    completed: 'Completed',
    previewDone: 'Preview generation is complete. Click "Save Enhanced Version" to save.',
    failedPrefix: 'Failed: {message}',
    libraryRefreshed: 'Library refreshed',
    resetDefaultsDone: 'All enhancement settings reset to default.',
    noPendingPreview: 'No pending enhanced preview to save.',
    enhancedSaved: 'Enhanced image saved.',
    originalUpdated: 'Original image updated.',
    loadingOriginal: 'Loading original image...',
    versionFileMissing: 'Version file is missing',
    originalVersionDeleteBlocked: 'Original version cannot be deleted here',
    deleteVersionConfirm: 'Delete version {version}?',
    deletedVersion: 'Deleted version {version}',
    sharedImageEnabled: 'Version {version} is now shared with all users.',
    sharedImageDisabled: 'Version {version} sharing turned off.',
    shareActionFailed: 'Share action failed',
    versionActionFailed: 'Version action failed',
    deleteImageConfirm: 'Delete "{name}"? This cannot be undone.',
    deletedImage: 'Deleted "{name}"',
    selectEnhancedFirst: 'Select one or more enhanced versions (2+) first.',
    deleteSelectedEnhancedConfirm: 'Delete selected enhanced versions: {versions} ?',
    deletedSelectedEnhanced: 'Deleted {count} selected enhanced version(s).',
    deleteAllEnhancedConfirm: 'Delete all enhanced versions and keep only original image?',
    deletedAllEnhanced: 'Deleted all enhanced versions.',
    newPasswordMin: 'New password must be at least 8 characters.',
    newPasswordConfirmMismatch: 'New password confirmation does not match.',
    passwordUpdated: 'Password updated successfully.',
    processingFailed: 'Processing failed',
    heroSubtitle: 'Upload, restore, compare, and download your photos.'
  },
  vi: {
    title: 'Image Restore Studio',
    language: 'Ngôn ngữ',
    account: 'Tài khoản',
    register: 'Đăng ký',
    email: 'Email',
    password: 'Mật khẩu',
    login: 'Đăng nhập',
    admin: 'Quản trị',
    logout: 'Đăng xuất',
    uploadImage: 'Tải ảnh lên',
    caption: 'Chú thích',
    showMetadata: 'Hiển thị thông tin ảnh',
    hideMetadata: 'Giấu thông tin ảnh',
    showCaption: 'Hiển thị chú thích',
    hideCaption: 'Giấu chú thích',
    layoutTile: 'Bố cục: Ô',
    layoutMasonry: 'Bố cục: Masonry',
    totalImages: 'Tổng số ảnh: {count}',
    sharedImages: 'Ảnh chia sẻ',
    yourImages: 'Ảnh của bạn',
    refreshLibrary: 'Làm mới thư viện',
    notification: 'Thông báo',
    close: 'Đóng',
    confirmAction: 'Xác nhận thao tác',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    createAccount: 'Tạo tài khoản',
    passwordMinHint: 'Mật khẩu (ít nhất 8 ký tự)',
    confirmPassword: 'Xác nhận mật khẩu',
    changePasswordRequired: 'Yêu cầu đổi mật khẩu',
    forcePasswordHint: 'Vì bảo mật, bạn phải đổi mật khẩu tạm trước khi tiếp tục.',
    currentPassword: 'Mật khẩu hiện tại',
    newPasswordMinHint: 'Mật khẩu mới (ít nhất 8 ký tự)',
    confirmNewPassword: 'Xác nhận mật khẩu mới',
    updatePassword: 'Cập nhật mật khẩu',
    imageEnhancement: 'Nâng cấp ảnh',
    faceRestore: 'Khôi phục khuôn mặt',
    colorize: 'Tô màu (DeOldify)',
    resize4x: 'Phóng to (4x)',
    resizeCustom: 'Đổi kích thước (Tùy chỉnh)',
    width: 'Chiều rộng',
    height: 'Chiều cao',
    auto: 'auto',
    faceStrength: 'Độ mạnh khuôn mặt',
    sharpen: 'Độ nét',
    contrast: 'Tương phản',
    saturation: 'Độ bão hòa',
    brightness: 'Độ sáng',
    denoise: 'Khử nhiễu',
    processing: 'Đang xử lý...',
    original: 'Gốc',
    enhanced: 'Đã nâng cấp',
    sizeLine: 'Kích thước: {size} | Độ phân giải: {resolution}',
    saveEnhancedVersion: 'Lưu phiên bản nâng cấp',
    resetAllSettings: 'Đặt lại mọi thiết lập',
    generatePreview: 'Tạo xem trước',
    cropPreview: 'Xem trước',
    rotate: 'Xoay',
    rotateLeft: 'Xoay trái',
    rotateRight: 'Xoay phải',
    orientation: 'Hướng xoay',
    applyCrop: 'Áp dụng cắt',
    useOriginal: 'Dùng ảnh gốc',
    signedInAs: 'Đăng nhập với {email}',
    areYouSure: 'Bạn có chắc không?',
    imageNumber: 'ảnh #{n}',
    view: 'Xem',
    share: 'Chia sẻ',
    unshare: 'Bỏ chia sẻ',
    download: 'Tải xuống',
    delete: 'Xóa',
    resolutionLoading: 'đang tải...',
    resolutionDash: '-',
    imageCaption: '{name} | dung lượng {size} | tải lên {time}',
    versions: 'Phiên bản:',
    enhance: 'Nâng cấp',
    editOriginal: 'Sửa ảnh gốc',
    emailRequired: 'Email là bắt buộc.',
    passwordMin: 'Mật khẩu phải có ít nhất 8 ký tự.',
    passwordConfirmMismatch: 'Xác nhận mật khẩu không khớp.',
    registered: 'Đã đăng ký: {email}',
    registerFailed: 'Đăng ký thất bại.',
    loggedIn: 'Đã đăng nhập',
    loginFailed: 'Đăng nhập thất bại. Hãy kiểm tra email và mật khẩu rồi thử lại.',
    loggedOut: 'Đã đăng xuất',
    selectImageFirst: 'Hãy chọn ảnh trước',
    selectImageFromList: 'Hãy chọn ảnh trước từ mục Ảnh của bạn',
    uploaded: 'Đã tải lên "{name}"',
    imageWord: 'ảnh',
    startingJob: 'Bắt đầu xử lý',
    widthPositive: 'Chiều rộng phải là số dương',
    heightPositive: 'Chiều cao phải là số dương hoặc "auto"',
    completed: 'Hoàn tất',
    previewDone: 'Đã tạo xong ảnh xem trước. Nhấn "Lưu phiên bản nâng cấp" để lưu.',
    failedPrefix: 'Lỗi: {message}',
    libraryRefreshed: 'Đã làm mới thư viện',
    resetDefaultsDone: 'Đã đặt lại toàn bộ thiết lập nâng cấp về mặc định.',
    noPendingPreview: 'Không có bản xem trước nâng cấp để lưu.',
    enhancedSaved: 'Đã lưu ảnh nâng cấp.',
    originalUpdated: 'Đã cập nhật ảnh gốc.',
    loadingOriginal: 'Đang tải ảnh gốc...',
    versionFileMissing: 'Không tìm thấy tệp phiên bản',
    originalVersionDeleteBlocked: 'Không thể xóa phiên bản gốc ở đây',
    deleteVersionConfirm: 'Xóa phiên bản {version}?',
    deletedVersion: 'Đã xóa phiên bản {version}',
    versionActionFailed: 'Thao tác phiên bản thất bại',
    deleteImageConfirm: 'Xóa "{name}"? Thao tác này không thể hoàn tác.',
    deletedImage: 'Đã xóa "{name}"',
    selectEnhancedFirst: 'Hãy chọn một hoặc nhiều phiên bản nâng cấp (2+) trước.',
    deleteSelectedEnhancedConfirm: 'Xóa các phiên bản nâng cấp đã chọn: {versions} ?',
    deletedSelectedEnhanced: 'Đã xóa {count} phiên bản nâng cấp đã chọn.',
    deleteAllEnhancedConfirm: 'Xóa toàn bộ phiên bản nâng cấp và chỉ giữ ảnh gốc?',
    deletedAllEnhanced: 'Đã xóa toàn bộ phiên bản nâng cấp.',
    newPasswordMin: 'Mật khẩu mới phải có ít nhất 8 ký tự.',
    newPasswordConfirmMismatch: 'Xác nhận mật khẩu mới không khớp.',
    passwordUpdated: 'Cập nhật mật khẩu thành công.',
    processingFailed: 'Xử lý thất bại',
    heroSubtitle: 'Tải lên, khôi phục, so sánh và tải xuống ảnh của bạn.'
  }
};

function t(key, params = {}) {
  const pack = i18n[currentLang] || i18n.en;
  const fallback = i18n.en[key];
  const template = pack[key] || fallback || key;
  return String(template).replace(/\{(\w+)\}/g, (_, token) => (
    Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : `{${token}}`
  ));
}

function getLocale() {
  return currentLang === 'vi' ? 'vi-VN' : 'en-US';
}

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
const cropCaptionInputEl = document.getElementById('cropCaptionInput');
const cropCancelEl = document.getElementById('cropCancel');
const cropApplyEl = document.getElementById('cropApply');
const cropUseOriginalEl = document.getElementById('cropUseOriginal');
const cropRotateLeftEl = document.getElementById('cropRotateLeft');
const cropRotateRightEl = document.getElementById('cropRotateRight');
const cropRotateSliderEl = document.getElementById('cropRotateSlider');
const cropRotateValueEl = document.getElementById('cropRotateValue');
const filePickerBtnEl = document.getElementById('filePickerBtn');
const filePickerNameEl = document.getElementById('filePickerName');
const toggleMetadataEl = document.getElementById('toggleMetadata');
const toggleMetadataSharedEl = document.getElementById('toggleMetadataShared');
const toggleSharedLayoutEl = document.getElementById('toggleSharedLayout');
const yourImagesCountEl = document.getElementById('yourImagesCount');
const sharedImagesCountEl = document.getElementById('sharedImagesCount');
const loginPasswordInputEl = document.getElementById('password');
const loginPasswordToggleEl = document.getElementById('toggleLoginPassword');
const languageLabelEl = document.getElementById('languageLabel');
const languageToggleEl = document.getElementById('languageToggle');
const socket = window.io ? window.io({ withCredentials: true }) : null;
let socketId = null;
let cropper = null;
let pendingUploadFile = null;
let cropSourceFile = null;
let cropMode = 'upload';
let cropTargetImageId = null;
let pendingResizeDefaultsFromOriginal = false;
let isRefreshingImages = false;
let progressHideTimer = null;
let cropRotationDeg = 0;
const versionMenuState = {
  imageId: null,
  versionNum: null,
  filePath: '',
  sizeBytes: null,
  versionShared: false,
  hideTimer: null
};
const versionContextMenuEl = document.createElement('div');
versionContextMenuEl.className = 'version-context-menu';
versionContextMenuEl.hidden = true;
versionContextMenuEl.innerHTML = `
  <button type="button" data-action="view">View</button>
  <button type="button" data-action="download">Download</button>
  <button type="button" data-action="share">Share</button>
  <button type="button" data-action="delete" class="danger">Delete</button>
`;
document.body.appendChild(versionContextMenuEl);
const versionViewModalEl = document.createElement('div');
versionViewModalEl.className = 'version-view-modal';
versionViewModalEl.hidden = true;
versionViewModalEl.innerHTML = `
  <div class="version-view-dialog">
    <button type="button" class="version-view-nav prev" aria-label="Previous enhanced image" title="Previous enhanced image">‹</button>
    <button type="button" class="version-view-nav next" aria-label="Next enhanced image" title="Next enhanced image">›</button>
    <button type="button" class="version-view-close" aria-label="Close">&times;</button>
    <button type="button" class="version-view-compare" aria-label="Show original" title="Show original">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5c5.3 0 9.7 3.8 11 7-1.3 3.2-5.7 7-11 7s-9.7-3.8-11-7c1.3-3.2 5.7-7 11-7zm0 2C8 7 4.5 9.7 3.2 12 4.5 14.3 8 17 12 17s7.5-2.7 8.8-5C19.5 9.7 16 7 12 7zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/>
      </svg>
    </button>
    <img class="version-view-image version-view-image-base" alt="Version image preview" />
    <img class="version-view-image version-view-image-overlay" alt="Original image preview" hidden />
  </div>
`;
document.body.appendChild(versionViewModalEl);
const versionViewImageEl = versionViewModalEl.querySelector('.version-view-image-base');
const versionViewOverlayImageEl = versionViewModalEl.querySelector('.version-view-image-overlay');
const versionViewPrevEl = versionViewModalEl.querySelector('.version-view-nav.prev');
const versionViewNextEl = versionViewModalEl.querySelector('.version-view-nav.next');
const versionViewCloseEl = versionViewModalEl.querySelector('.version-view-close');
const versionViewCompareEl = versionViewModalEl.querySelector('.version-view-compare');
const versionMenuDeleteBtnEl = versionContextMenuEl.querySelector('button[data-action="delete"]');
const versionMenuMetaEl = versionContextMenuEl.querySelector('[data-meta]');
const versionViewState = {
  enhancedPath: '',
  originalPath: '',
  imageId: null,
  enhancedVersionIndex: -1,
  showingOriginal: false,
  enhancedDims: null,
  originalDims: null
};
const imageDimsCache = new Map();
let confirmResolver = null;
let forcePasswordRequired = false;
const filePickerText = {
  en: {
    chooseFile: 'Choose File',
    noFileChosen: 'No file chosen'
  },
  vi: {
    chooseFile: 'Chọn ảnh',
    noFileChosen: 'Chưa chọn ảnh'
  }
};

function syncUseEnhancedButton() {
  if (!useEnhancedBtnEl) return;
  useEnhancedBtnEl.disabled = !state.pendingEnhancedPath;
}

function setCheckboxLabel(inputId, labelText) {
  const inputEl = document.getElementById(inputId);
  if (!inputEl) return;
  const wrap = inputEl.closest('label');
  if (!wrap) return;
  const textNode = Array.from(wrap.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.nodeValue = ` ${labelText}`;
}

function updateCropModalTitle() {
  const cropTitleEl = document.getElementById('cropTitle');
  if (!cropTitleEl) return;
  cropTitleEl.textContent = cropMode === 'edit-original' ? t('editOriginal') : t('uploadImage');
}

function syncMetadataToggleButtons() {
  const label = state.showImageMetadata ? t('hideMetadata') : t('showMetadata');
  if (!toggleMetadataEl) return;
  toggleMetadataEl.textContent = label;
  toggleMetadataEl.setAttribute('aria-label', label);
  toggleMetadataEl.title = label;
}

function syncLoginPasswordToggle() {
  if (!loginPasswordInputEl || !loginPasswordToggleEl) return;
  const showing = loginPasswordInputEl.type === 'text';
  const label = showing ? t('hidePassword') : t('showPassword');
  loginPasswordToggleEl.setAttribute('aria-label', label);
  loginPasswordToggleEl.title = label;
  loginPasswordToggleEl.setAttribute('aria-pressed', showing ? 'true' : 'false');
}

function syncImageCounts() {
  if (yourImagesCountEl) {
    yourImagesCountEl.textContent = t('totalImages', { count: state.images.length });
  }
  if (sharedImagesCountEl) {
    const sharedCount = state.sharedImages.reduce((acc, row) => (
      acc + ((row?.versions || []).filter((v) => v && v.file_path).length || 0)
    ), 0);
    sharedImagesCountEl.textContent = t('totalImages', { count: sharedCount });
  }
}

function syncSharedLayoutUI() {
  const sharedListEl = document.getElementById('sharedImages');
  if (sharedListEl) {
    sharedListEl.classList.toggle('shared-layout-masonry', state.sharedLayout === 'masonry');
  }
  if (toggleSharedLayoutEl) {
    const label = state.sharedLayout === 'masonry' ? t('layoutMasonry') : t('layoutTile');
    toggleSharedLayoutEl.textContent = label;
    toggleSharedLayoutEl.title = label;
    toggleSharedLayoutEl.setAttribute('aria-label', label);
  }
}

function syncSharedCaptionToggleUI() {
  if (!toggleMetadataSharedEl) return;
  const label = state.showSharedCaptions ? t('hideCaption') : t('showCaption');
  toggleMetadataSharedEl.textContent = label;
  toggleMetadataSharedEl.setAttribute('aria-label', label);
  toggleMetadataSharedEl.title = label;
}

function applyLanguage() {
  document.documentElement.lang = currentLang === 'vi' ? 'vi' : 'en';
  document.title = t('title');
  if (languageLabelEl) languageLabelEl.textContent = t('language');
  if (languageToggleEl) {
    languageToggleEl.value = currentLang;
    languageToggleEl.setAttribute('aria-label', t('language'));
  }

  const setText = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  const setPlaceholder = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = t(key);
  };

  setText('heroTitle', 'title');
  setText('heroSubtitle', 'heroSubtitle');
  setText('accountTitle', 'account');
  setText('register', 'register');
  setText('login', 'login');
  setText('adminLink', 'admin');
  setText('logout', 'logout');
  setText('uploadTitle', 'uploadImage');
  if (filePickerBtnEl) filePickerBtnEl.textContent = getFilePickerText('chooseFile');
  updateFilePickerLabel(photoInputEl?.files?.[0] || null);
  setText('yourImagesTitle', 'yourImages');
  setText('sharedImagesTitle', 'sharedImages');
  setText('noticeTitle', 'notification');
  setText('noticeClose', 'close');
  setText('confirmTitle', 'confirmAction');
  setText('confirmCancel', 'cancel');
  setText('confirmOk', 'confirm');
  setText('registerTitle', 'createAccount');
  setText('registerCancel', 'cancel');
  setText('registerSubmit', 'register');
  setText('forcePasswordTitle', 'changePasswordRequired');
  setText('forcePasswordHint', 'forcePasswordHint');
  setText('forcePasswordSubmit', 'updatePassword');
  setText('forcePasswordLogout', 'logout');
  setText('enhanceTitle', 'imageEnhancement');
  setText('originalTitle', 'original');
  setText('enhancedTitle', 'enhanced');
  setText('closeEnhanceModal', 'cancel');
  setText('useEnhancedBtn', 'saveEnhancedVersion');
  setText('resetAdjustmentsBtn', 'resetAllSettings');
  setText('process', 'generatePreview');
  updateCropModalTitle();
  setText('cropPreviewTitle', 'cropPreview');
  setText('cropRotateLabel', 'rotate');
  setText('cropRotateLeft', 'rotateLeft');
  setText('cropRotateRight', 'rotateRight');
  setText('cropCaptionLabel', 'caption');
  setPlaceholder('cropCaptionInput', 'captionPlaceholder');
  if (cropRotateValueEl) cropRotateValueEl.textContent = `${Math.round(Number(cropRotationDeg) || 0)}°`;
  const cropOrientationLabelEl = document.getElementById('cropOrientationLabel');
  if (cropOrientationLabelEl) {
    cropOrientationLabelEl.childNodes[0].nodeValue = `${t('orientation')}: `;
  }
  setText('cropCancel', 'cancel');
  setText('cropApply', 'applyCrop');
  setText('cropUseOriginal', 'useOriginal');

  setPlaceholder('email', 'email');
  setPlaceholder('password', 'password');
  setPlaceholder('registerEmail', 'email');
  setPlaceholder('registerPassword', 'passwordMinHint');
  setPlaceholder('registerPasswordConfirm', 'confirmPassword');
  setPlaceholder('forceCurrentPassword', 'currentPassword');
  setPlaceholder('forceNewPassword', 'newPasswordMinHint');
  setPlaceholder('forceConfirmPassword', 'confirmNewPassword');
  setPlaceholder('targetWidth', 'width');
  setPlaceholder('targetHeight', 'auto');

  setCheckboxLabel('face', t('faceRestore'));
  setCheckboxLabel('colorize', t('colorize'));
  setCheckboxLabel('upscale', t('resize4x'));
  setCheckboxLabel('resize', t('resizeCustom'));

  const refreshBtn = document.getElementById('refresh');
  if (refreshBtn) {
    refreshBtn.title = t('refreshLibrary');
    refreshBtn.setAttribute('aria-label', t('refreshLibrary'));
  }
  if (uploadedPreviewEl) uploadedPreviewEl.alt = t('original');
  if (completedPreviewEl) completedPreviewEl.alt = t('enhanced');
  const cropImage = document.getElementById('cropImage');
  if (cropImage) cropImage.alt = t('cropPreview');
  const versionHoverImage = document.getElementById('versionHoverImage');
  if (versionHoverImage) versionHoverImage.alt = t('enhanced');
  if (versionViewCloseEl) versionViewCloseEl.setAttribute('aria-label', t('close'));
  if (versionViewImageEl) versionViewImageEl.alt = t('enhanced');
  if (versionViewOverlayImageEl) versionViewOverlayImageEl.alt = t('original');

  const viewBtn = versionContextMenuEl.querySelector('button[data-action="view"]');
  const downloadBtn = versionContextMenuEl.querySelector('button[data-action="download"]');
  const shareBtn = versionContextMenuEl.querySelector('button[data-action="share"]');
  const deleteBtn = versionContextMenuEl.querySelector('button[data-action="delete"]');
  if (viewBtn) viewBtn.textContent = t('view');
  if (downloadBtn) downloadBtn.textContent = t('download');
  if (shareBtn) shareBtn.textContent = t('share');
  if (deleteBtn) deleteBtn.textContent = t('delete');
  if (versionMenuMetaEl) {
    versionMenuMetaEl.textContent = t('sizeLine', {
      size: t('resolutionDash'),
      resolution: t('resolutionDash')
    });
  }

  updateSliderLabels();
  updatePreviewSizeLabels();
  syncMetadataToggleButtons();
  syncSharedLayoutUI();
  syncSharedCaptionToggleUI();
  syncImageCounts();
  renderImageList();
  renderSharedImageList();
  if (state.currentUser && state.currentUser.email) {
    accountLabelEl.textContent = t('signedInAs', { email: state.currentUser.email });
  }
}

function setLanguage(lang) {
  const next = supportedLanguages.has(lang) ? lang : 'en';
  if (currentLang === next) return;
  currentLang = next;
  window.localStorage.setItem(LANG_KEY, currentLang);
  applyLanguage();
}

function setProgress(progress, message = t('processing')) {
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
  progressLabelEl.textContent = t('processing');
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
  const dimPart = dims ? `${dims.width}x${dims.height}px` : t('resolutionDash');
  return t('sizeLine', { size: bytePart, resolution: dimPart });
}

function formatUploadedAt(value) {
  if (!value) return t('resolutionDash');
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return t('resolutionDash');
  return dt.toLocaleString(getLocale());
}

function getImageNameById(imageId) {
  const n = Number(imageId);
  const row = state.images.find((x) => Number(x.id) === n);
  return row?.original_name || t('imageNumber', { n });
}

function updatePreviewSizeLabels() {
  beforeSizeEl.textContent = formatSizeLine(state.beforeBytes, state.beforeDims);
  afterSizeEl.textContent = formatSizeLine(state.afterBytes, state.afterDims);
}

function updateSliderLabels() {
  const faceWrap = faceStrengthValueEl.closest('.slider-title');
  const sharpenWrap = sharpenValueEl.closest('.slider-title');
  const contrastWrap = contrastValueEl.closest('.slider-title');
  const saturationWrap = saturationValueEl.closest('.slider-title');
  const gammaWrap = gammaValueEl.closest('.slider-title');
  const denoiseWrap = denoiseValueEl.closest('.slider-title');
  const widthWrap = targetWidthEl.closest('.slider-wrap')?.querySelector('.slider-title');
  const heightWrap = targetHeightEl.closest('.slider-wrap')?.querySelector('.slider-title');

  faceStrengthValueEl.textContent = Number(faceStrengthEl.value || 0.7).toFixed(1);
  contrastValueEl.textContent = Number(contrastEl.value || 1).toFixed(1);
  saturationValueEl.textContent = Number(saturationEl.value || 1).toFixed(1);
  gammaValueEl.textContent = Number(gammaEl.value || 1).toFixed(1);
  sharpenValueEl.textContent = Number(sharpenEl.value || 0).toFixed(1);
  denoiseValueEl.textContent = String(Math.round(Number(denoiseEl.value || 0)));

  if (faceWrap) faceWrap.childNodes[0].nodeValue = `${t('faceStrength')}: `;
  if (sharpenWrap) sharpenWrap.childNodes[0].nodeValue = `${t('sharpen')}: `;
  if (contrastWrap) contrastWrap.childNodes[0].nodeValue = `${t('contrast')}: `;
  if (saturationWrap) saturationWrap.childNodes[0].nodeValue = `${t('saturation')}: `;
  if (gammaWrap) gammaWrap.childNodes[0].nodeValue = `${t('brightness')}: `;
  if (denoiseWrap) denoiseWrap.childNodes[0].nodeValue = `${t('denoise')}: `;
  if (widthWrap) widthWrap.textContent = t('width');
  if (heightWrap) heightWrap.textContent = t('height');
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
  const previewToDiscard = state.pendingEnhancedPath;
  const selectedImageId = Number(state.selectedImageId) || null;
  if (previewToDiscard && selectedImageId) {
    discardPendingPreview(selectedImageId, previewToDiscard).catch(() => {});
  }
  state.pendingEnhancedPath = '';
  if (previewToDiscard && state.completedPreviewUrl === previewToDiscard) {
    state.completedPreviewUrl = '';
    state.afterBytes = null;
    renderPreviews();
  }
  enhanceModalEl.hidden = true;
  state.suppressExistingEnhancedPreview = false;
  resetProgress();
}

function setAuthUI(user) {
  const loggedIn = Boolean(user && user.email);
  const role = (user && user.role) ? String(user.role).toLowerCase() : 'user';
  forcePasswordRequired = Boolean(user && user.force_password_change);
  state.currentUser = loggedIn ? user : null;
  authGuestEl.hidden = loggedIn;
  authUserEl.hidden = !loggedIn;
  if (registerBtnEl) registerBtnEl.hidden = loggedIn;
  if (authMessageEl) {
    authMessageEl.hidden = loggedIn;
    if (loggedIn) authMessageEl.textContent = '';
  }
  authGuestEl.style.display = loggedIn ? 'none' : 'grid';
  authUserEl.style.display = loggedIn ? 'flex' : 'none';
  accountLabelEl.textContent = loggedIn ? t('signedInAs', { email: user.email }) : '';
  if (adminLinkEl) adminLinkEl.hidden = !(loggedIn && role === 'admin');
  authOnlyEls.forEach((el) => {
    el.hidden = !loggedIn || forcePasswordRequired;
  });
  if (!loggedIn) resetProgress();
  if (!loggedIn) {
    closeEnhanceModal();
    pendingUploadFile = null;
    photoInputEl.value = '';
    updateFilePickerLabel(null);
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
  confirmMessageEl.textContent = String(message || t('areYouSure'));
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

function getEnhancedVersions(image) {
  return (image?.versions || [])
    .filter((v) => Number(v.version_num) > 1 && v.file_path)
    .sort((a, b) => Number(a.version_num) - Number(b.version_num));
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
  versionMenuState.versionShared = false;
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

function getFilePickerText(key) {
  const pack = filePickerText[currentLang] || filePickerText.en;
  return pack[key] || filePickerText.en[key] || key;
}

function updateFilePickerLabel(file) {
  if (!filePickerNameEl) return;
  filePickerNameEl.textContent = (file && file.name) ? String(file.name) : getFilePickerText('noFileChosen');
}

function getImageRowById(imageId) {
  const n = Number(imageId);
  return state.images.find((row) => Number(row.id) === n)
    || state.sharedImages.find((row) => Number(row.id) === n)
    || null;
}

function isVersionShared(imageId, versionNum) {
  const row = state.images.find((img) => Number(img.id) === Number(imageId));
  if (!row) return false;
  const version = (row.versions || []).find((v) => Number(v.version_num) === Number(versionNum));
  return Boolean(version && version.is_shared);
}

function getOriginalPathForImage(imageId) {
  const row = getImageRowById(imageId);
  if (!row) return '';
  const v1 = (row.versions || []).find((v) => Number(v.version_num) === 1);
  return row.original_path || v1?.file_path || row.current_path || '';
}

function isOriginalSmallerThanEnhanced() {
  const enhanced = versionViewState.enhancedDims;
  const original = versionViewState.originalDims;
  if (!enhanced || !original) return false;
  return original.width < enhanced.width && original.height < enhanced.height;
}

function setVersionViewOverlayActive(active) {
  const canOverlay = isOriginalSmallerThanEnhanced() && Boolean(versionViewState.originalPath);
  const show = Boolean(active && canOverlay);
  versionViewModalEl.classList.toggle('version-view-overlay-active', show);
  if (versionViewOverlayImageEl) versionViewOverlayImageEl.hidden = !show;
}

function setVersionViewSource(showOriginal) {
  const wantOriginal = Boolean(showOriginal && versionViewState.originalPath);
  versionViewState.showingOriginal = wantOriginal;
  setVersionViewOverlayActive(false);
  const nextSrc = wantOriginal ? versionViewState.originalPath : versionViewState.enhancedPath;
  if (!nextSrc) return;
  if (versionViewImageEl.src !== nextSrc) {
    versionViewImageEl.src = nextSrc;
  }
}

function updateVersionViewNavButtons() {
  const image = getImageRowById(versionViewState.imageId);
  const enhancedVersions = getEnhancedVersions(image);
  const hasNav = Boolean(versionViewState.imageId) && enhancedVersions.length > 0;
  if (versionViewPrevEl) versionViewPrevEl.hidden = !hasNav;
  if (versionViewNextEl) versionViewNextEl.hidden = !hasNav;
}

function browseVersionInModal(direction) {
  const image = getImageRowById(versionViewState.imageId);
  const enhancedVersions = getEnhancedVersions(image);
  if (enhancedVersions.length === 0) return;

  const originalPath = getOriginalPathForImage(versionViewState.imageId);
  const hasOriginal = Boolean(originalPath);
  const candidates = hasOriginal
    ? [originalPath, ...enhancedVersions.map((v) => v.file_path).filter(Boolean)]
    : enhancedVersions.map((v) => v.file_path).filter(Boolean);

  if (candidates.length <= 1) return;

  const currentPath = versionViewState.enhancedPath;
  let idx = candidates.findIndex((path) => path === currentPath);
  if (idx < 0) idx = 0;
  idx = (idx + (direction >= 0 ? 1 : -1) + candidates.length) % candidates.length;
  const targetPath = candidates[idx];
  openVersionViewModal(targetPath, originalPath, versionViewState.imageId);
}

function openVersionViewModal(filePath, originalPath = '', imageId = null) {
  if (!filePath) return;
  versionViewState.enhancedPath = filePath;
  versionViewState.originalPath = originalPath;
  versionViewState.imageId = Number.isFinite(Number(imageId)) ? Number(imageId) : null;
  versionViewState.enhancedVersionIndex = -1;
  versionViewState.showingOriginal = false;
  versionViewState.enhancedDims = null;
  versionViewState.originalDims = null;
  versionViewImageEl.src = filePath;
  if (versionViewState.imageId) {
    const image = getImageRowById(versionViewState.imageId);
    const enhancedVersions = getEnhancedVersions(image);
    versionViewState.enhancedVersionIndex = enhancedVersions.findIndex((v) => v.file_path === filePath);
  }
  updateVersionViewNavButtons();
  if (versionViewCompareEl) {
    const canCompare = Boolean(originalPath && originalPath !== filePath);
    versionViewCompareEl.hidden = !canCompare;
  }
  if (versionViewOverlayImageEl) {
    versionViewOverlayImageEl.src = originalPath || '';
    versionViewOverlayImageEl.hidden = true;
  }
  versionViewModalEl.classList.remove('version-view-overlay-active');
  if (originalPath) {
    Promise.all([loadImageDimensions(filePath), loadImageDimensions(originalPath)]).then(([enhanced, original]) => {
      if (versionViewState.enhancedPath !== filePath || versionViewState.originalPath !== originalPath) return;
      versionViewState.enhancedDims = enhanced;
      versionViewState.originalDims = original;
    });
  }
  versionViewModalEl.hidden = false;
}

function closeVersionViewModal() {
  versionViewState.enhancedPath = '';
  versionViewState.originalPath = '';
  versionViewState.imageId = null;
  versionViewState.enhancedVersionIndex = -1;
  versionViewState.showingOriginal = false;
  versionViewState.enhancedDims = null;
  versionViewState.originalDims = null;
  versionViewModalEl.classList.remove('version-view-overlay-active');
  versionViewModalEl.hidden = true;
  versionViewImageEl.src = '';
  updateVersionViewNavButtons();
  if (versionViewCompareEl) {
    versionViewCompareEl.hidden = true;
  }
  if (versionViewOverlayImageEl) {
    versionViewOverlayImageEl.hidden = true;
    versionViewOverlayImageEl.src = '';
  }
}

function showVersionMenu(imageId, versionNum, filePath, sizeBytes, event, versionShared = null) {
  versionMenuState.imageId = Number(imageId);
  versionMenuState.versionNum = Number(versionNum);
  versionMenuState.filePath = filePath || '';
  versionMenuState.sizeBytes = Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : null;
  versionMenuState.versionShared = versionShared === null ? isVersionShared(imageId, versionNum) : Boolean(versionShared);
  const shareBtn = versionContextMenuEl.querySelector('button[data-action="share"]');
  if (shareBtn) {
    shareBtn.textContent = versionMenuState.versionShared ? t('unshare') : t('share');
  }
  if (versionMenuDeleteBtnEl) {
    versionMenuDeleteBtnEl.hidden = Number(versionNum) <= 1;
  }
  const menuW = 140;
  const menuH = 118;
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
}

function openCropModal(imageUrl, options = {}) {
  cropMode = options.mode === 'edit-original' ? 'edit-original' : 'upload';
  cropTargetImageId = Number(options.imageId) || null;
  cropSourceFile = options.sourceFile || photoInputEl.files[0] || null;
  if (cropCaptionInputEl) {
    cropCaptionInputEl.value = String(options.caption || '').slice(0, 1000);
  }
  updateCropModalTitle();
  if (!window.Cropper) {
    pendingUploadFile = cropSourceFile;
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
  setCropRotation(0);
}

function closeCropModal() {
  cropModalEl.hidden = true;
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  cropMode = 'upload';
  cropTargetImageId = null;
  cropSourceFile = null;
  if (cropCaptionInputEl) cropCaptionInputEl.value = '';
}

function setCropRotation(nextDeg) {
  const numeric = Number(nextDeg);
  const clamped = Math.max(-180, Math.min(180, Number.isFinite(numeric) ? numeric : 0));
  cropRotationDeg = Math.round(clamped);
  if (cropRotateSliderEl) cropRotateSliderEl.value = String(cropRotationDeg);
  if (cropRotateValueEl) cropRotateValueEl.textContent = `${cropRotationDeg}°`;
  if (cropper) cropper.rotateTo(cropRotationDeg);
}

async function deleteImage(imageId) {
  const imageName = getImageNameById(imageId);
  const ok = await askConfirm(t('deleteImageConfirm', { name: imageName }));
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
  log(t('deletedImage', { name: imageName }));
}

async function deleteSelectedEnhancedVersions(imageId, versions = []) {
  const selectedEnhanced = [...versions]
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 1);
  if (!selectedEnhanced.length) {
    throw new Error(t('selectEnhancedFirst'));
  }

  const ok = await askConfirm(t('deleteSelectedEnhancedConfirm', {
    versions: selectedEnhanced.sort((a, b) => a - b).join(', ')
  }));
  if (!ok) return;

  await api(`/api/images/${imageId}/versions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versions: selectedEnhanced })
  });

  const selectedSet = getSelectedVersions(imageId);
  selectedEnhanced.forEach((v) => selectedSet.delete(v));
  await refreshImages();
  log(t('deletedSelectedEnhanced', { count: selectedEnhanced.length }), { popup: true });
}

async function deleteAllEnhancedVersions(imageId) {
  const ok = await askConfirm(t('deleteAllEnhancedConfirm'));
  if (!ok) return;

  await api(`/api/images/${imageId}/enhanced`, { method: 'DELETE' });

  const selectedSet = getSelectedVersions(imageId);
  selectedSet.clear();
  await refreshImages();
  log(t('deletedAllEnhanced'), { popup: true });
}

function renderImageList() {
  const list = document.getElementById('images');
  list.innerHTML = '';
  syncImageCounts();

  state.images.forEach((row) => {
    const li = document.createElement('li');

    const metaWrap = document.createElement('div');
    metaWrap.className = 'image-meta';
    const topRow = document.createElement('div');
    topRow.className = 'image-top-row';

    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'image-icon';
    icon.setAttribute('aria-label', `${t('view')}: ${row.original_name || `image-${row.id}`}`);
    const iconImg = document.createElement('img');
    iconImg.alt = row.original_name || `image-${row.id}`;
    iconImg.src = row.icon_path || row.original_path || row.current_path || '';
    iconImg.loading = 'lazy';
    iconImg.onerror = () => {
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM7 9a2 2 0 1 0 0.001 0zM6 17h12l-4-5-3 4-2-2z"/></svg>';
    };
    icon.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const originalPath = getOriginalPathForImage(row.id);
      if (!originalPath) return;
      openVersionViewModal(originalPath, originalPath, row.id);
    };
    icon.appendChild(iconImg);

    const meta = document.createElement('span');
    meta.className = 'image-caption';
    meta.textContent = t('imageCaption', {
      name: row.original_name,
      size: formatBytes(row.current_size_bytes),
      time: formatUploadedAt(row.created_at)
    });
    topRow.appendChild(icon);

    const versions = document.createElement('div');
    versions.className = 'version-row';
    const versionTitle = document.createElement('span');
    versionTitle.className = 'version-title';
    versionTitle.textContent = t('versions');
    versions.appendChild(versionTitle);
    (row.versions || []).forEach((v) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'version-chip';
      chip.textContent = String(v.version_num);
      if (v.is_shared) {
        chip.classList.add('shared');
        chip.title = t('shared');
        chip.setAttribute('aria-label', `${t('shared')} ${v.version_num}`);
      }
      chip.onmouseenter = (e) => {
        clearVersionMenuHideTimer();
        showVersionMenu(row.id, v.version_num, v.file_path, v.size_bytes, e, v.is_shared);
      };
      chip.onmouseleave = () => {
        scheduleHideVersionMenu();
      };
      chip.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const originalPath = Number(v.version_num) > 1 ? getOriginalPathForImage(row.id) : '';
        openVersionViewModal(v.file_path, originalPath, row.id);
      };
      chip.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showVersionMenu(row.id, v.version_num, v.file_path, v.size_bytes, e, v.is_shared);
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
    if (state.showImageMetadata) {
      metaWrap.appendChild(meta);
    }
    if (row.caption) {
      const captionTextEl = document.createElement('span');
      captionTextEl.className = 'image-caption-text';
      captionTextEl.textContent = row.caption;
      metaWrap.appendChild(captionTextEl);
    }
    metaWrap.onclick = () => setSelectedImage(row);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const enhanceBtn = document.createElement('button');
    enhanceBtn.className = 'ghost';
    enhanceBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6V3L8 7l4 4V8c2.8 0 5 2.2 5 5a5 5 0 0 1-5 5 5 5 0 0 1-4.9-4H5.1A7 7 0 0 0 12 20a7 7 0 0 0 0-14z"/></svg><span>${t('enhance')}</span>`;
    enhanceBtn.onclick = () => {
      state.suppressExistingEnhancedPreview = true;
      setSelectedImage(row, { showCurrentAsEnhanced: false });
      openEnhanceModal();
    };

    const editOriginalBtn = document.createElement('button');
    editOriginalBtn.className = 'ghost';
    editOriginalBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l10.06-10.06.92.92L5.92 19.58zM20.71 6.04a1 1 0 0 0 0-1.41L19.37 3.3a1 1 0 0 0-1.41 0l-1.14 1.14 3.75 3.75 1.14-1.15z"/></svg><span>${t('editOriginal')}</span>`;
    editOriginalBtn.onclick = async () => {
      try {
        log(t('loadingOriginal'));
        const sourcePath = row.original_path || row.current_path || '';
        if (!sourcePath) throw new Error(t('versionFileMissing'));
        const sourceFile = await loadImageAsFile(sourcePath, row.original_name || 'original.jpg');
        const objectUrl = URL.createObjectURL(sourceFile);
        openCropModal(objectUrl, {
          mode: 'edit-original',
          imageId: row.id,
          sourceFile,
          caption: row.caption || ''
        });
      } catch (err) {
        log(err.message || t('versionActionFailed'));
      }
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger ghost';
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8l1 2h4v2H3V7h4l1-2zm1 6h2v8H9v-8zm4 0h2v8h-2v-8z"/></svg><span>${t('delete')}</span>`;
    deleteBtn.onclick = () => deleteImage(row.id).catch((e) => log(e.message));
    actions.appendChild(enhanceBtn);
    actions.appendChild(editOriginalBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(metaWrap);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function renderSharedImageList() {
  const list = document.getElementById('sharedImages');
  if (!list) return;
  list.innerHTML = '';
  syncImageCounts();

  state.sharedImages.forEach((row) => {
    (row.versions || []).forEach((v) => {
      if (!v || !v.file_path) return;

      const li = document.createElement('li');
      const tileBtn = document.createElement('button');
      tileBtn.type = 'button';
      tileBtn.className = 'shared-image-tile-btn';
      tileBtn.setAttribute('aria-label', `${t('view')}: ${row.original_name || `image-${row.id}`}`);
      const hoverTitle = row.caption
        ? String(row.caption)
        : (row.owner_email ? t('sharedBy', { email: row.owner_email }) : t('view'));
      tileBtn.title = hoverTitle;

      const img = document.createElement('img');
      img.alt = row.original_name || `image-${row.id}`;
      img.src = v.file_path;
      img.loading = 'lazy';
      if (row.caption) {
        img.title = String(row.caption);
      }
      img.onerror = () => {
        img.src = row.icon_path || row.original_path || row.current_path || '';
      };

      tileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const originalPath = Number(v.version_num) > 1 ? getOriginalPathForImage(row.id) : '';
        openVersionViewModal(v.file_path, originalPath, row.id);
      });

      tileBtn.appendChild(img);
      if (state.showSharedCaptions && row.caption) {
        const captionOverlayEl = document.createElement('span');
        captionOverlayEl.className = 'shared-image-caption-overlay';
        captionOverlayEl.textContent = String(row.caption);
        tileBtn.appendChild(captionOverlayEl);
      }
      li.appendChild(tileBtn);
      list.appendChild(li);
    });
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
    if (!email) throw new Error(t('emailRequired'));
    if (password.length < 8) throw new Error(t('passwordMin'));
    if (password !== confirmPassword) throw new Error(t('passwordConfirmMismatch'));

    const data = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    log(t('registered', { email: data.email }), { popup: true });
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    closeRegisterModal();
    window.setTimeout(() => {
      window.location.reload();
    }, 250);
  } catch (e) {
    registerMessageEl.textContent = e.message || t('registerFailed');
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
    log(t('loggedIn'));
  } catch (e) {
    if (authMessageEl) {
      authMessageEl.textContent = e.message || t('loginFailed');
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
    state.sharedImages = [];
    state.selectedImageId = null;
    state.uploadedPreviewUrl = '';
    state.completedPreviewUrl = '';
    state.beforeBytes = null;
    state.afterBytes = null;
    state.pendingEnhancedPath = '';
    forcePasswordRequired = false;
    renderImageList();
    renderSharedImageList();
    renderPreviews();
    log(t('loggedOut'));
  } catch (e) {
    log(e.message);
  }
};

async function uploadPendingOrSelectedFile(caption = '') {
  const file = pendingUploadFile || photoInputEl.files[0];
  if (!file) throw new Error(t('selectImageFirst'));

  const form = new FormData();
  form.append('photo', file);
  form.append('caption', String(caption || '').trim().slice(0, 1000));
  const data = await api('/api/images/upload', { method: 'POST', body: form });

  state.selectedImageId = data.imageId;
  state.completedPreviewUrl = '';
  state.afterBytes = null;
  state.pendingEnhancedPath = '';
  renderPreviews();
  pendingUploadFile = null;
  photoInputEl.value = '';
  updateFilePickerLabel(null);

  log(t('uploaded', { name: file.name || t('imageWord') }));
  await refreshImages();
}

async function updateOriginalImage(imageId, file, caption = '') {
  if (!imageId || !file) throw new Error(t('selectImageFirst'));
  const form = new FormData();
  form.append('photo', file);
  form.append('caption', String(caption || '').trim().slice(0, 1000));
  await api(`/api/images/${imageId}/original`, { method: 'POST', body: form });
  state.selectedImageId = imageId;
  state.pendingEnhancedPath = '';
  state.completedPreviewUrl = '';
  state.afterBytes = null;
  await refreshImages();
  const selected = getImageRowById(imageId);
  if (selected) setSelectedImage(selected);
  log(t('originalUpdated'));
}

async function discardPendingPreview(imageId, previewPath) {
  if (!imageId || !previewPath) return;
  try {
    await api(`/api/images/${imageId}/preview/discard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview_path: previewPath })
    });
  } catch (_err) {
    // Keep UX non-blocking if cleanup fails.
  }
}

async function loadImageAsFile(filePath, fallbackName = 'image.jpg') {
  const res = await fetch(String(filePath), { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const ext = pathExtFromMime(blob.type) || pathExtFromName(fallbackName) || 'jpg';
  const safeName = String(fallbackName || `image.${ext}`).replace(/[\\/:*?"<>|]+/g, '_');
  return new File([blob], safeName, { type: blob.type || `image/${ext}` });
}

function pathExtFromName(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function pathExtFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  return map[String(mime || '').toLowerCase()] || '';
}

document.getElementById('process').onclick = async () => {
  try {
    const imageId = Number(state.selectedImageId);
    if (!imageId) throw new Error(t('selectImageFromList'));
    const oldPendingPreview = state.pendingEnhancedPath;
    if (oldPendingPreview) {
      await discardPendingPreview(imageId, oldPendingPreview);
      state.pendingEnhancedPath = '';
      if (state.completedPreviewUrl === oldPendingPreview) {
        state.completedPreviewUrl = '';
        state.afterBytes = null;
        renderPreviews();
      }
    }
    setProgress(3, t('startingJob'));
    const targetWidth = Number(targetWidthEl.value);
    const targetHeightRaw = String(targetHeightEl.value || '').trim().toLowerCase();
    let targetHeightValue = null;
    if (resizeEl.checked) {
      if (!Number.isFinite(targetWidth) || targetWidth <= 0) throw new Error(t('widthPositive'));
      if (targetHeightRaw !== '' && targetHeightRaw !== 'auto') {
        const targetHeight = Number(targetHeightRaw);
        if (!Number.isFinite(targetHeight) || targetHeight <= 0) throw new Error(t('heightPositive'));
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
    state.afterBytes = Number.isFinite(Number(data.preview_size_bytes)) ? Number(data.preview_size_bytes) : null;
    renderPreviews();
    setProgress(100, t('completed'));

    log(t('previewDone'));
  } catch (e) {
    setProgress(0, t('failedPrefix', { message: e.message }));
    log(e.message);
  }
};

async function refreshImages() {
  if (isRefreshingImages) return;
  isRefreshingImages = true;
  try {
    const [mine, shared] = await Promise.all([
      api('/api/images'),
      api('/api/images/shared')
    ]);
    state.images = [...mine].sort((a, b) => {
      const aTs = new Date(a.created_at || 0).getTime();
      const bTs = new Date(b.created_at || 0).getTime();
      if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) {
        return bTs - aTs;
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });
    state.sharedImages = [...shared].sort((a, b) => {
      const aTs = new Date(a.created_at || 0).getTime();
      const bTs = new Date(b.created_at || 0).getTime();
      if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) {
        return bTs - aTs;
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });
    renderImageList();
    renderSharedImageList();

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
    log(t('libraryRefreshed'));
  } catch (e) {
    log(e.message);
  }
};

if (toggleMetadataEl) {
  toggleMetadataEl.addEventListener('click', () => {
    state.showImageMetadata = !state.showImageMetadata;
    window.localStorage.setItem(METADATA_VIS_KEY, String(state.showImageMetadata));
    syncMetadataToggleButtons();
    renderImageList();
    renderSharedImageList();
  });
}

if (toggleMetadataSharedEl) {
  toggleMetadataSharedEl.addEventListener('click', () => {
    state.showSharedCaptions = !state.showSharedCaptions;
    window.localStorage.setItem(SHARED_CAPTION_VIS_KEY, String(state.showSharedCaptions));
    syncSharedCaptionToggleUI();
    renderSharedImageList();
  });
}

if (toggleSharedLayoutEl) {
  toggleSharedLayoutEl.addEventListener('click', () => {
    state.sharedLayout = state.sharedLayout === 'tile' ? 'masonry' : 'tile';
    window.localStorage.setItem(SHARED_LAYOUT_KEY, state.sharedLayout);
    syncSharedLayoutUI();
  });
}

if (loginPasswordToggleEl && loginPasswordInputEl) {
  loginPasswordToggleEl.addEventListener('click', () => {
    loginPasswordInputEl.type = loginPasswordInputEl.type === 'password' ? 'text' : 'password';
    syncLoginPasswordToggle();
  });
}

closeEnhanceModalEl.addEventListener('click', closeEnhanceModal);
resetAdjustmentsBtnEl.addEventListener('click', () => {
  resetEnhanceAdjustments();
  log(t('resetDefaultsDone'));
});
useEnhancedBtnEl.addEventListener('click', () => {
  const imageId = Number(state.selectedImageId);
  if (!imageId || !state.pendingEnhancedPath) {
    log(t('noPendingPreview'));
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
      log(t('enhancedSaved'));
    })
    .catch((e) => log(e.message));
});

photoInputEl.addEventListener('change', () => {
  const file = photoInputEl.files[0];
  updateFilePickerLabel(file || null);
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  openCropModal(objectUrl, { mode: 'upload', sourceFile: file, caption: '' });
});

cropCancelEl.addEventListener('click', () => {
  const wasUpload = cropMode === 'upload';
  closeCropModal();
  if (wasUpload) {
    photoInputEl.value = '';
    updateFilePickerLabel(null);
  }
  pendingUploadFile = null;
});

cropApplyEl.addEventListener('click', () => {
  if (!cropper) return;
  const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const mode = cropMode;
    const targetImageId = cropTargetImageId;
    const caption = String(cropCaptionInputEl?.value || '').trim().slice(0, 1000);
    const originalName = (cropSourceFile && cropSourceFile.name) || (photoInputEl.files[0] && photoInputEl.files[0].name) || 'cropped.jpg';
    pendingUploadFile = new File([blob], originalName, { type: blob.type || 'image/jpeg' });
    state.uploadedPreviewUrl = URL.createObjectURL(pendingUploadFile);
    state.beforeBytes = pendingUploadFile.size;
    state.completedPreviewUrl = '';
    state.afterBytes = null;
    pendingResizeDefaultsFromOriginal = true;
    renderPreviews();
    closeCropModal();
    if (mode === 'edit-original' && targetImageId) {
      updateOriginalImage(targetImageId, pendingUploadFile, caption).catch((e) => log(e.message));
    } else {
      uploadPendingOrSelectedFile(caption).catch((e) => log(e.message));
    }
  }, 'image/jpeg', 0.95);
});

cropUseOriginalEl.addEventListener('click', () => {
  const original = cropSourceFile || photoInputEl.files[0];
  if (!original) return;
  const mode = cropMode;
  const targetImageId = cropTargetImageId;
  const caption = String(cropCaptionInputEl?.value || '').trim().slice(0, 1000);
  pendingUploadFile = original;
  state.uploadedPreviewUrl = URL.createObjectURL(original);
  state.beforeBytes = original.size;
  state.completedPreviewUrl = '';
  state.afterBytes = null;
  pendingResizeDefaultsFromOriginal = true;
  renderPreviews();
  closeCropModal();
  if (mode === 'edit-original' && targetImageId) {
    updateOriginalImage(targetImageId, pendingUploadFile, caption).catch((e) => log(e.message));
  } else {
    uploadPendingOrSelectedFile(caption).catch((e) => log(e.message));
  }
});

if (cropRotateLeftEl) {
  cropRotateLeftEl.addEventListener('click', () => {
    setCropRotation(cropRotationDeg - 90);
  });
}

if (cropRotateRightEl) {
  cropRotateRightEl.addEventListener('click', () => {
    setCropRotation(cropRotationDeg + 90);
  });
}

if (cropRotateSliderEl) {
  cropRotateSliderEl.addEventListener('input', () => {
    setCropRotation(cropRotateSliderEl.value);
  });
}

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
  const versionShared = Boolean(versionMenuState.versionShared);
  hideVersionMenu();

  try {
    if (!imageId || !versionNum) return;
    if (action === 'view') {
      if (!filePath) throw new Error(t('versionFileMissing'));
      const originalPath = versionNum > 1 ? getOriginalPathForImage(imageId) : '';
      openVersionViewModal(filePath, originalPath, imageId);
      return;
    }
    if (action === 'download') {
      downloadImage(imageId, [versionNum]);
      return;
    }
    if (action === 'share') {
      const nextShared = !versionShared;
      await api(`/api/images/${imageId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: versionNum, shared: nextShared })
      });
      await refreshImages();
      log(nextShared
        ? t('sharedImageEnabled', { version: versionNum })
        : t('sharedImageDisabled', { version: versionNum }), { popup: true });
      return;
    }
    if (action === 'delete') {
      if (versionNum <= 1) throw new Error(t('originalVersionDeleteBlocked'));
      const ok = await askConfirm(t('deleteVersionConfirm', { version: versionNum }));
      if (!ok) return;
      await api(`/api/images/${imageId}/versions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versions: [versionNum] })
      });
      const selectedSet = getSelectedVersions(imageId);
      selectedSet.delete(versionNum);
      await refreshImages();
      log(t('deletedVersion', { version: versionNum }), { popup: true });
    }
  } catch (err) {
    if (action === 'share') {
      log(err.message || t('shareActionFailed'));
      return;
    }
    log(err.message || t('versionActionFailed'));
  }
});

versionViewCloseEl.addEventListener('click', closeVersionViewModal);
versionViewPrevEl.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  browseVersionInModal(-1);
});
versionViewNextEl.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  browseVersionInModal(1);
});
versionViewCompareEl.addEventListener('mouseenter', () => {
  if (versionViewModalEl.hidden) return;
  if (!versionViewState.originalPath) return;
  if (versionViewState.originalPath === versionViewState.enhancedPath) return;
  if (isOriginalSmallerThanEnhanced()) {
    setVersionViewOverlayActive(true);
    return;
  }
  setVersionViewSource(true);
});
versionViewCompareEl.addEventListener('mouseleave', () => {
  if (versionViewModalEl.hidden) return;
  if (isOriginalSmallerThanEnhanced()) {
    setVersionViewOverlayActive(false);
    return;
  }
  setVersionViewSource(false);
});
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
completedPreviewEl.addEventListener('click', () => {
  if (!state.completedPreviewUrl) return;
  const imageId = Number(state.selectedImageId) || null;
  const originalPath = imageId ? getOriginalPathForImage(imageId) : '';
  openVersionViewModal(state.completedPreviewUrl, originalPath, imageId);
});

if (languageToggleEl) {
  languageToggleEl.value = currentLang;
  languageToggleEl.addEventListener('change', (event) => {
    setLanguage(String(event.target.value || 'en').toLowerCase());
  });
}

applyLanguage();
syncLoginPasswordToggle();
syncSharedLayoutUI();
syncSharedCaptionToggleUI();
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
      setProgress(0, t('failedPrefix', { message: event.message || t('processingFailed') }));
      return;
    }
    setProgress(event.progress, event.message || t('processing'));
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
      if (newPassword.length < 8) throw new Error(t('newPasswordMin'));
      if (newPassword !== confirmPassword) throw new Error(t('newPasswordConfirmMismatch'));
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
      log(t('passwordUpdated'));
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

