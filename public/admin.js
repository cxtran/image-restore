async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const ctype = res.headers.get('content-type') || '';
  const body = ctype.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error((body && (body.error || body.message)) || `HTTP ${res.status}`);
  return body;
}

const state = {
  me: null,
  users: [],
  images: []
};

const LANG_KEY = 'ui_language';
const supportedLanguages = new Set(['en', 'vi']);
let currentLang = (() => {
  const saved = String(window.localStorage.getItem(LANG_KEY) || 'en').toLowerCase();
  return supportedLanguages.has(saved) ? saved : 'en';
})();

const i18n = {
  en: {
    adminTitle: 'Admin - Image Restore Studio',
    language: 'Language',
    administration: 'Administration',
    adminHeroSubtitle: 'Manage users, roles, and all images on the server.',
    adminAccount: 'Admin Account',
    checkingAdmin: 'Checking admin access...',
    addUser: 'Add User',
    email: 'Email',
    passwordMinHint: 'Password (min 8 chars)',
    createUser: 'Create User',
    users: 'Users',
    refreshUsers: 'Refresh Users',
    allImages: 'All Images',
    refreshImages: 'Refresh Images',
    adminNotification: 'Admin Notification',
    close: 'Close',
    delete: 'Delete',
    confirmAction: 'Confirm Action',
    cancel: 'Cancel',
    confirm: 'Confirm',
    resetPassword: 'Reset Password',
    newPasswordMinHint: 'New password (min 8 chars)',
    save: 'Save',
    signedInAs: 'Signed in as {email} ({role})',
    imageNumber: 'image #{n}',
    role: 'Role',
    created: 'Created',
    images: 'Images',
    action: 'Action',
    original: 'Original',
    owner: 'Owner',
    name: 'Name',
    updated: 'Updated',
    userCreated: 'User created.',
    setNewPassword: 'Set a new password for user {userId}.',
    deleteUserConfirm: 'Delete user {userId}? This removes all their images.',
    deletedUser: 'Deleted user {userId}.',
    deleteImageConfirm: 'Delete "{imageName}"?',
    deletedImage: 'Deleted "{imageName}".',
    passwordMin: 'Password must be at least 8 characters.',
    passwordReset: 'Password reset for user {userId}.'
  },
  vi: {
    adminTitle: 'Quản trị - Image Restore Studio',
    language: 'Ngôn ngữ',
    administration: 'Quản trị',
    adminHeroSubtitle: 'Quản lý người dùng, vai trò và toàn bộ ảnh trên máy chủ.',
    adminAccount: 'Tài khoản quản trị',
    checkingAdmin: 'Đang kiểm tra quyền quản trị...',
    addUser: 'Thêm người dùng',
    email: 'Email',
    passwordMinHint: 'Mật khẩu (ít nhất 8 ký tự)',
    createUser: 'Tạo người dùng',
    users: 'Người dùng',
    refreshUsers: 'Làm mới người dùng',
    allImages: 'Toàn bộ ảnh',
    refreshImages: 'Làm mới ảnh',
    adminNotification: 'Thông báo quản trị',
    close: 'Đóng',
    delete: 'Xóa',
    confirmAction: 'Xác nhận thao tác',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    resetPassword: 'Đặt lại mật khẩu',
    newPasswordMinHint: 'Mật khẩu mới (ít nhất 8 ký tự)',
    save: 'Lưu',
    signedInAs: 'Đăng nhập với {email} ({role})',
    imageNumber: 'ảnh #{n}',
    role: 'Vai trò',
    created: 'Ngày tạo',
    images: 'Ảnh',
    action: 'Thao tác',
    original: 'Gốc',
    owner: 'Chủ sở hữu',
    name: 'Tên',
    updated: 'Cập nhật',
    userCreated: 'Đã tạo người dùng.',
    setNewPassword: 'Đặt mật khẩu mới cho người dùng {userId}.',
    deleteUserConfirm: 'Xóa người dùng {userId}? Thao tác này sẽ xóa toàn bộ ảnh của họ.',
    deletedUser: 'Đã xóa người dùng {userId}.',
    deleteImageConfirm: 'Xóa "{imageName}"?',
    deletedImage: 'Đã xóa "{imageName}".',
    passwordMin: 'Mật khẩu phải có ít nhất 8 ký tự.',
    passwordReset: 'Đã đặt lại mật khẩu cho người dùng {userId}.'
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

function displayRole(role) {
  const value = String(role || 'user').toLowerCase();
  if (currentLang === 'vi') {
    return value === 'admin' ? 'quản trị' : 'người dùng';
  }
  return value;
}

const adminIdentityEl = document.getElementById('adminIdentity');
const usersTableBodyEl = document.querySelector('#usersTable tbody');
const imagesTableBodyEl = document.querySelector('#imagesTable tbody');
const adminNoticeEl = document.getElementById('adminNotice');
const adminNoticeTextEl = document.getElementById('adminNoticeText');
const adminNoticeCloseEl = document.getElementById('adminNoticeClose');
const adminConfirmEl = document.getElementById('adminConfirm');
const adminConfirmTextEl = document.getElementById('adminConfirmText');
const adminConfirmCancelEl = document.getElementById('adminConfirmCancel');
const adminConfirmOkEl = document.getElementById('adminConfirmOk');
const adminResetPwdEl = document.getElementById('adminResetPwd');
const adminResetPwdTextEl = document.getElementById('adminResetPwdText');
const adminResetPwdInputEl = document.getElementById('adminResetPwdInput');
const adminResetPwdCancelEl = document.getElementById('adminResetPwdCancel');
const adminResetPwdOkEl = document.getElementById('adminResetPwdOk');
const languageLabelEl = document.getElementById('languageLabel');
const languageToggleEl = document.getElementById('languageToggle');
let confirmResolver = null;
let resetPwdUserId = null;

function fmtDate(value) {
  const dt = new Date(value || '');
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString(currentLang === 'vi' ? 'vi-VN' : 'en-US');
}

function applyLanguage() {
  document.documentElement.lang = currentLang === 'vi' ? 'vi' : 'en';
  document.title = t('adminTitle');
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

  setText('adminHeroTitle', 'administration');
  setText('adminHeroSubtitle', 'adminHeroSubtitle');
  setText('adminAccountTitle', 'adminAccount');
  setText('addUserTitle', 'addUser');
  setText('createUserBtn', 'createUser');
  setText('usersTitle', 'users');
  setText('allImagesTitle', 'allImages');
  setText('adminNoticeTitle', 'adminNotification');
  setText('adminNoticeClose', 'close');
  setText('adminConfirmTitle', 'confirmAction');
  setText('adminConfirmCancel', 'cancel');
  setText('adminConfirmOk', 'confirm');
  setText('resetPasswordTitle', 'resetPassword');
  setText('adminResetPwdCancel', 'cancel');
  setText('adminResetPwdOk', 'save');

  setPlaceholder('newEmail', 'email');
  setPlaceholder('newPassword', 'passwordMinHint');
  setPlaceholder('adminResetPwdInput', 'newPasswordMinHint');
  const roleSelect = document.getElementById('newRole');
  if (roleSelect && roleSelect.options.length >= 2) {
    roleSelect.options[0].textContent = displayRole('user');
    roleSelect.options[1].textContent = displayRole('admin');
  }

  const reloadUsersBtn = document.getElementById('reloadUsersBtn');
  if (reloadUsersBtn) {
    reloadUsersBtn.title = t('refreshUsers');
    reloadUsersBtn.setAttribute('aria-label', t('refreshUsers'));
  }
  const reloadImagesBtn = document.getElementById('reloadImagesBtn');
  if (reloadImagesBtn) {
    reloadImagesBtn.title = t('refreshImages');
    reloadImagesBtn.setAttribute('aria-label', t('refreshImages'));
  }

  const usersHeaders = document.querySelectorAll('#usersTable thead th');
  if (usersHeaders.length >= 6) {
    usersHeaders[2].textContent = t('role');
    usersHeaders[3].textContent = t('created');
    usersHeaders[4].textContent = t('images');
    usersHeaders[5].textContent = t('action');
  }
  const imagesHeaders = document.querySelectorAll('#imagesTable thead th');
  if (imagesHeaders.length >= 7) {
    imagesHeaders[1].textContent = t('original');
    imagesHeaders[2].textContent = t('owner');
    imagesHeaders[3].textContent = t('name');
    imagesHeaders[4].textContent = t('created');
    imagesHeaders[5].textContent = t('updated');
    imagesHeaders[6].textContent = t('action');
  }

  if (!state.me) {
    adminIdentityEl.textContent = t('checkingAdmin');
  } else {
    adminIdentityEl.textContent = t('signedInAs', { email: state.me.email, role: displayRole(state.me.role) });
  }

  renderUsers();
  renderImages();
}

function setLanguage(lang) {
  const next = supportedLanguages.has(lang) ? lang : 'en';
  if (currentLang === next) return;
  currentLang = next;
  window.localStorage.setItem(LANG_KEY, currentLang);
  applyLanguage();
}

function notify(msg) {
  adminNoticeTextEl.textContent = String(msg);
  adminNoticeEl.hidden = false;
}

function closeNotify() {
  adminNoticeEl.hidden = true;
}

function askConfirm(msg) {
  if (confirmResolver) {
    confirmResolver(false);
    confirmResolver = null;
  }
  adminConfirmTextEl.textContent = String(msg);
  adminConfirmEl.hidden = false;
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function settleConfirm(answer) {
  adminConfirmEl.hidden = true;
  if (!confirmResolver) return;
  const resolve = confirmResolver;
  confirmResolver = null;
  resolve(Boolean(answer));
}

function getImageNameById(imageId) {
  const n = Number(imageId);
  const row = state.images.find((x) => Number(x.id) === n);
  return row?.original_name || t('imageNumber', { n });
}

function renderUsers() {
  usersTableBodyEl.innerHTML = '';
  state.users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.email}</td>
      <td>${displayRole(u.role || 'user')}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td>${u.image_count ?? 0}</td>
      <td>
        <span class="action-group">
          <button class="ghost" data-reset-password="${u.id}">${t('resetPassword')}</button>
          <button class="danger ghost" data-delete-user="${u.id}">${t('delete')}</button>
        </span>
      </td>
    `;
    usersTableBodyEl.appendChild(tr);
  });
}

function renderImages() {
  imagesTableBodyEl.innerHTML = '';
  state.images.forEach((img) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${img.id}</td>
      <td>
        <span class="admin-image-icon">
          <img src="${img.original_path || ''}" alt="${img.original_name || t('original')}" loading="lazy" />
        </span>
      </td>
      <td>${img.user_email}</td>
      <td>${img.original_name}</td>
      <td>${fmtDate(img.created_at)}</td>
      <td>${fmtDate(img.updated_at)}</td>
      <td><button class="danger ghost" data-delete-image="${img.id}">${t('delete')}</button></td>
    `;
    const iconImg = tr.querySelector('.admin-image-icon img');
    if (iconImg) {
      iconImg.addEventListener('error', () => {
        const iconWrap = tr.querySelector('.admin-image-icon');
        if (!iconWrap) return;
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM7 9a2 2 0 1 0 0.001 0zM6 17h12l-4-5-3 4-2-2z"/></svg>';
      }, { once: true });
    }
    imagesTableBodyEl.appendChild(tr);
  });
}

async function loadUsers() {
  state.users = await api('/api/admin/users');
  renderUsers();
}

async function loadImages() {
  state.images = await api('/api/admin/images');
  renderImages();
}

async function ensureAdmin() {
  const me = await api('/api/auth/me');
  state.me = me;
  if ((me.role || 'user') !== 'admin') {
    window.location.href = '/';
    return false;
  }
  adminIdentityEl.textContent = t('signedInAs', { email: me.email, role: displayRole(me.role) });
  return true;
}


document.getElementById('createUserBtn').addEventListener('click', async () => {
  try {
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    await api('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role })
    });
    document.getElementById('newEmail').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newRole').value = 'user';
    await loadUsers();
    notify(t('userCreated'));
  } catch (error) {
    notify(error.message);
  }
});

document.getElementById('reloadUsersBtn').addEventListener('click', () => {
  loadUsers().catch((e) => notify(e.message));
});

document.getElementById('reloadImagesBtn').addEventListener('click', () => {
  loadImages().catch((e) => notify(e.message));
});

usersTableBodyEl.addEventListener('click', async (e) => {
  const resetBtn = e.target.closest('button[data-reset-password]');
  if (resetBtn) {
    const userId = Number(resetBtn.getAttribute('data-reset-password'));
    if (!userId) return;
    resetPwdUserId = userId;
    adminResetPwdTextEl.textContent = t('setNewPassword', { userId });
    adminResetPwdInputEl.value = '';
    adminResetPwdEl.hidden = false;
    adminResetPwdInputEl.focus();
    return;
  }

  const btn = e.target.closest('button[data-delete-user]');
  if (!btn) return;
  const userId = Number(btn.getAttribute('data-delete-user'));
  if (!userId) return;
  const ok = await askConfirm(t('deleteUserConfirm', { userId }));
  if (!ok) return;
  try {
    await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
    await Promise.all([loadUsers(), loadImages()]);
    notify(t('deletedUser', { userId }));
  } catch (error) {
    notify(error.message);
  }
});

imagesTableBodyEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-delete-image]');
  if (!btn) return;
  const imageId = Number(btn.getAttribute('data-delete-image'));
  if (!imageId) return;
  const imageName = getImageNameById(imageId);
  const ok = await askConfirm(t('deleteImageConfirm', { imageName }));
  if (!ok) return;
  try {
    await api(`/api/admin/images/${imageId}`, { method: 'DELETE' });
    await loadImages();
    notify(t('deletedImage', { imageName }));
  } catch (error) {
    notify(error.message);
  }
});

adminNoticeCloseEl.addEventListener('click', closeNotify);
adminNoticeEl.addEventListener('click', (e) => {
  if (e.target === adminNoticeEl) closeNotify();
});
adminConfirmCancelEl.addEventListener('click', () => settleConfirm(false));
adminConfirmOkEl.addEventListener('click', () => settleConfirm(true));
adminConfirmEl.addEventListener('click', (e) => {
  if (e.target === adminConfirmEl) settleConfirm(false);
});
adminResetPwdCancelEl.addEventListener('click', () => {
  adminResetPwdEl.hidden = true;
  resetPwdUserId = null;
});
adminResetPwdOkEl.addEventListener('click', async () => {
  const userId = Number(resetPwdUserId);
  const password = String(adminResetPwdInputEl.value || '');
  if (!userId) return;
  if (password.length < 8) {
    notify(t('passwordMin'));
    return;
  }
  try {
    await api(`/api/admin/users/${userId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    adminResetPwdEl.hidden = true;
    resetPwdUserId = null;
    notify(t('passwordReset', { userId }));
  } catch (error) {
    notify(error.message);
  }
});
adminResetPwdEl.addEventListener('click', (e) => {
  if (e.target === adminResetPwdEl) {
    adminResetPwdEl.hidden = true;
    resetPwdUserId = null;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !adminNoticeEl.hidden) closeNotify();
  if (e.key === 'Escape' && !adminConfirmEl.hidden) settleConfirm(false);
  if (e.key === 'Escape' && !adminResetPwdEl.hidden) {
    adminResetPwdEl.hidden = true;
    resetPwdUserId = null;
  }
});

if (languageToggleEl) {
  languageToggleEl.value = currentLang;
  languageToggleEl.addEventListener('change', (event) => {
    setLanguage(String(event.target.value || 'en').toLowerCase());
  });
}

applyLanguage();

ensureAdmin()
  .then(async (ok) => {
    if (!ok) return;
    await Promise.all([loadUsers(), loadImages()]);
  })
  .catch(() => {
    window.location.href = '/';
  });
