async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const ctype = res.headers.get('content-type') || '';
  const body = ctype.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error((body && (body.error || body.message)) || `HTTP ${res.status}`);
  return body;
}

const slideImageEl = document.getElementById('slideImage');
const slideMetaEl = document.getElementById('slideMeta');
const prevBtn = document.getElementById('prevSlide');
const nextBtn = document.getElementById('nextSlide');
const playBtn = document.getElementById('togglePlay');

const state = {
  items: [],
  index: 0,
  playing: true,
  timer: null,
  delayMs: 3500
};

function setMeta(text) {
  if (slideMetaEl) slideMetaEl.textContent = String(text || '');
}

function renderSlide() {
  if (!state.items.length) {
    if (slideImageEl) slideImageEl.removeAttribute('src');
    setMeta('No shared images available.');
    return;
  }

  const item = state.items[state.index];
  if (slideImageEl) {
    slideImageEl.src = item.path;
    slideImageEl.alt = item.name || 'Shared slide';
    slideImageEl.title = item.caption || '';
  }

  const caption = item.caption ? ` | ${item.caption}` : '';
  const owner = item.owner ? ` | Shared by ${item.owner}` : '';
  setMeta(`${state.index + 1}/${state.items.length} | ${item.name || 'image'}${owner}${caption}`);
}

function restartTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (!state.playing || state.items.length <= 1) return;
  state.timer = setInterval(() => {
    state.index = (state.index + 1) % state.items.length;
    renderSlide();
  }, state.delayMs);
}

function setPlaying(next) {
  state.playing = Boolean(next);
  if (playBtn) playBtn.textContent = state.playing ? 'Pause' : 'Play';
  restartTimer();
}

function move(delta) {
  if (!state.items.length) return;
  state.index = (state.index + delta + state.items.length) % state.items.length;
  renderSlide();
  restartTimer();
}

async function requireLogin() {
  try {
    await api('/api/auth/me');
    return true;
  } catch (_error) {
    const nextPath = `${window.location.pathname}${window.location.search || ''}`;
    const encoded = encodeURIComponent(nextPath);
    window.location.href = `/login.html?next=${encoded}`;
    return false;
  }
}

async function loadSlides() {
  try {
    const rows = await api('/api/images/shared');
    const flattened = [];
    rows.forEach((row) => {
      (row.versions || []).forEach((v) => {
        if (!v || !v.file_path) return;
        flattened.push({
          path: v.file_path,
          name: row.original_name || '',
          caption: row.caption || '',
          owner: row.owner_email || ''
        });
      });
    });

    state.items = flattened;
    state.index = 0;
    renderSlide();
    restartTimer();
  } catch (error) {
    setMeta(error.message || 'Failed to load shared images');
  }
}

if (prevBtn) {
  prevBtn.addEventListener('click', () => move(-1));
}
if (nextBtn) {
  nextBtn.addEventListener('click', () => move(1));
}
if (playBtn) {
  playBtn.addEventListener('click', () => setPlaying(!state.playing));
}

requireLogin().then((ok) => {
  if (!ok) return;
  loadSlides();
});
