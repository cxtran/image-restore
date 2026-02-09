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
let confirmResolver = null;
let resetPwdUserId = null;

function fmtDate(value) {
  const dt = new Date(value || '');
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString();
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
  return row?.original_name || `image #${n}`;
}

function renderUsers() {
  usersTableBodyEl.innerHTML = '';
  state.users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.email}</td>
      <td>${u.role || 'user'}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td>${u.image_count ?? 0}</td>
      <td>
        <span class="action-group">
          <button class="ghost" data-reset-password="${u.id}">Reset Password</button>
          <button class="danger ghost" data-delete-user="${u.id}">Delete</button>
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
          <img src="${img.original_path || ''}" alt="${img.original_name || 'original'}" loading="lazy" />
        </span>
      </td>
      <td>${img.user_email}</td>
      <td>${img.original_name}</td>
      <td>${fmtDate(img.created_at)}</td>
      <td>${fmtDate(img.updated_at)}</td>
      <td><button class="danger ghost" data-delete-image="${img.id}">Delete</button></td>
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
  adminIdentityEl.textContent = `Signed in as ${me.email} (${me.role})`;
  return true;
}

document.getElementById('backToApp').addEventListener('click', () => {
  window.location.href = '/';
});

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
    notify('User created.');
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
    adminResetPwdTextEl.textContent = `Set a new password for user ${userId}.`;
    adminResetPwdInputEl.value = '';
    adminResetPwdEl.hidden = false;
    adminResetPwdInputEl.focus();
    return;
  }

  const btn = e.target.closest('button[data-delete-user]');
  if (!btn) return;
  const userId = Number(btn.getAttribute('data-delete-user'));
  if (!userId) return;
  const ok = await askConfirm(`Delete user ${userId}? This removes all their images.`);
  if (!ok) return;
  try {
    await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
    await Promise.all([loadUsers(), loadImages()]);
    notify(`Deleted user ${userId}.`);
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
  const ok = await askConfirm(`Delete "${imageName}"?`);
  if (!ok) return;
  try {
    await api(`/api/admin/images/${imageId}`, { method: 'DELETE' });
    await loadImages();
    notify(`Deleted "${imageName}".`);
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
    notify('Password must be at least 8 characters.');
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
    notify(`Password reset for user ${userId}.`);
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

ensureAdmin()
  .then(async (ok) => {
    if (!ok) return;
    await Promise.all([loadUsers(), loadImages()]);
  })
  .catch(() => {
    window.location.href = '/';
  });
