async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const ctype = res.headers.get('content-type') || '';
  const body = ctype.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error((body && (body.error || body.message)) || `HTTP ${res.status}`);
  return body;
}

const LANG_KEY = 'ui_language';
const supportedLanguages = new Set(['en', 'vi']);
let currentLang = (() => {
  const saved = String(window.localStorage.getItem(LANG_KEY) || 'en').toLowerCase();
  return supportedLanguages.has(saved) ? saved : 'en';
})();

const i18n = {
  en: {
    title: 'Image Restore Studio - Login',
    heroTitle: 'Image Restore Studio',
    heroSubtitle: 'Sign in to continue to Your Images.',
    language: 'Language',
    loginTitle: 'Login',
    login: 'Login',
    email: 'Email',
    password: 'Password',
    showPassword: 'Show Password',
    hidePassword: 'Hide Password',
    loginFailed: 'Login failed. Check your email and password, then try again.'
  },
  vi: {
    title: 'Image Restore Studio - Dang nhap',
    heroTitle: 'Image Restore Studio',
    heroSubtitle: 'Dang nhap de tiep tuc den Anh cua ban.',
    language: 'Ngon ngu',
    loginTitle: 'Dang nhap',
    login: 'Dang nhap',
    email: 'Email',
    password: 'Mat khau',
    showPassword: 'Hien mat khau',
    hidePassword: 'An mat khau',
    loginFailed: 'Dang nhap that bai. Hay kiem tra email va mat khau roi thu lai.'
  }
};

function t(key) {
  const pack = i18n[currentLang] || i18n.en;
  return pack[key] || i18n.en[key] || key;
}

const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const loginBtnEl = document.getElementById('loginBtn');
const authMessageEl = document.getElementById('authMessage');
const languageLabelEl = document.getElementById('languageLabel');
const languageToggleEl = document.getElementById('languageToggle');
const toggleLoginPasswordEl = document.getElementById('toggleLoginPassword');

function syncPasswordToggleLabel() {
  if (!passwordEl || !toggleLoginPasswordEl) return;
  const showing = passwordEl.type === 'text';
  const label = showing ? t('hidePassword') : t('showPassword');
  toggleLoginPasswordEl.title = label;
  toggleLoginPasswordEl.setAttribute('aria-label', label);
}

function applyLanguage() {
  document.documentElement.lang = currentLang === 'vi' ? 'vi' : 'en';
  document.title = t('title');
  if (languageLabelEl) languageLabelEl.textContent = t('language');
  if (languageToggleEl) {
    languageToggleEl.value = currentLang;
    languageToggleEl.setAttribute('aria-label', t('language'));
  }
  const heroTitleEl = document.getElementById('heroTitle');
  const heroSubtitleEl = document.getElementById('heroSubtitle');
  const loginTitleEl = document.getElementById('loginTitle');
  if (heroTitleEl) heroTitleEl.textContent = t('heroTitle');
  if (heroSubtitleEl) heroSubtitleEl.textContent = t('heroSubtitle');
  if (loginTitleEl) loginTitleEl.textContent = t('loginTitle');
  if (emailEl) emailEl.placeholder = t('email');
  if (passwordEl) passwordEl.placeholder = t('password');
  if (loginBtnEl) loginBtnEl.textContent = t('login');
  syncPasswordToggleLabel();
}

function nextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = String(params.get('next') || '').trim();
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login.html')) {
    return next;
  }
  return '/your-images.html';
}

async function doLogin() {
  try {
    const email = String(emailEl?.value || '').trim();
    const password = String(passwordEl?.value || '');
    await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    window.location.href = nextPath();
  } catch (error) {
    if (authMessageEl) {
      authMessageEl.textContent = error.message || t('loginFailed');
      authMessageEl.hidden = false;
    }
  }
}

if (languageToggleEl) {
  languageToggleEl.value = currentLang;
  languageToggleEl.addEventListener('change', (event) => {
    const next = String(event.target.value || 'en').toLowerCase();
    currentLang = supportedLanguages.has(next) ? next : 'en';
    window.localStorage.setItem(LANG_KEY, currentLang);
    applyLanguage();
  });
}

if (loginBtnEl) {
  loginBtnEl.addEventListener('click', doLogin);
}
if (passwordEl) {
  passwordEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doLogin();
  });
}
if (toggleLoginPasswordEl && passwordEl) {
  toggleLoginPasswordEl.addEventListener('click', () => {
    passwordEl.type = passwordEl.type === 'password' ? 'text' : 'password';
    syncPasswordToggleLabel();
  });
}

applyLanguage();
api('/api/auth/me')
  .then(() => {
    window.location.href = '/your-images.html';
  })
  .catch(() => {});
