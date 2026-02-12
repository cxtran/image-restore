function getConfigFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('cfg');
  if (!key) return null;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch (_err) {
    return null;
  }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeLayout(value) {
  const v = String(value || '').toLowerCase();
  return v === 'title' || v === 'mansory' ? v : 'single';
}

function normalizeTheme(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'blackbg') return 'black';
  return ['default', 'vintage', 'noir', 'black', 'warm', 'ocean'].includes(v) ? v : 'default';
}

const config = getConfigFromQuery();
if (!config || !Array.isArray(config.slides) || config.slides.length === 0) {
  document.body.innerHTML = '<main class="app-shell"><section class="panel"><h2>No slideshow data found.</h2><p>Go back to slideshow builder and press Play again.</p><a href="/slideshow.html">Back to Slideshow Builder</a></section></main>';
  throw new Error('Missing slideshow config');
}

const state = {
  index: 0,
  timer: null,
  playing: true,
  musicOn: false,
  speedSeconds: clampNumber(config.speedSeconds || 5, 1, 30, 5),
  effect: String(config.effect || 'fade'),
  showCaption: Boolean(config.showCaption),
  musicTracks: Array.isArray(config.music) ? config.music.map((x) => x.url).filter(Boolean) : [],
  musicIndex: 0,
  layout: normalizeLayout(config.layout),
  theme: normalizeTheme(config.theme),
  titleRows: clampNumber(config.titleRows || 2, 1, 6, 2),
  titleCols: clampNumber(config.titleCols || 3, 1, 8, 3),
  mansorySizeMode: String(config.mansorySizeMode || 'custom') === 'auto' ? 'auto' : 'custom',
  mansorySize: clampNumber(config.mansorySize || 220, 120, 520, 220)
};

const playerNameEl = document.getElementById('playerName');
const playerMediaEl = document.querySelector('.player-media');
const slideGridEl = document.getElementById('slideGrid');
const slideImageEl = document.getElementById('slideImage');
const slideCaptionEl = document.getElementById('slideCaption');
const slideMetaEl = document.getElementById('slideMeta');
const togglePlayEl = document.getElementById('togglePlay');
const prevSlideEl = document.getElementById('prevSlide');
const nextSlideEl = document.getElementById('nextSlide');
const speedInputEl = document.getElementById('speedInput');
const effectInputEl = document.getElementById('effectInput');
const layoutInputEl = document.getElementById('layoutInput');
const themeInputEl = document.getElementById('themeInput');
const titleRowsWrapEl = document.getElementById('titleRowsWrap');
const titleColsWrapEl = document.getElementById('titleColsWrap');
const mansorySizeWrapEl = document.getElementById('mansorySizeWrap');
const titleRowsInputEl = document.getElementById('titleRowsInput');
const titleColsInputEl = document.getElementById('titleColsInput');
const mansorySizeModeInputEl = document.getElementById('mansorySizeModeInput');
const mansorySizeInputEl = document.getElementById('mansorySizeInput');
const musicToggleEl = document.getElementById('musicToggle');
const fullscreenBtnEl = document.getElementById('fullscreenBtn');
const toolbarToggleCollapseEl = document.getElementById('toolbarToggleCollapse');
const toolbarToggleExpandEl = document.getElementById('toolbarToggleExpand');
const backBtnEl = document.getElementById('backBtn');
const bgmEl = document.getElementById('bgm');

playerNameEl.textContent = String(config.name || 'Slideshow');
speedInputEl.value = String(state.speedSeconds);
effectInputEl.value = state.effect;
if (layoutInputEl) layoutInputEl.value = state.layout;
if (themeInputEl) themeInputEl.value = state.theme;
if (titleRowsInputEl) titleRowsInputEl.value = String(state.titleRows);
if (titleColsInputEl) titleColsInputEl.value = String(state.titleCols);
if (mansorySizeModeInputEl) mansorySizeModeInputEl.value = state.mansorySizeMode;
if (mansorySizeInputEl) mansorySizeInputEl.value = String(state.mansorySize);

function applyEffect() {
  slideImageEl.classList.remove('effect-fade', 'effect-zoom', 'effect-slide');
  slideImageEl.classList.add(`effect-${state.effect}`);
}

function applyTheme() {
  document.body.classList.remove(
    'player-theme-default',
    'player-theme-vintage',
    'player-theme-noir',
    'player-theme-black',
    'player-theme-warm',
    'player-theme-ocean'
  );
  document.body.classList.add(`player-theme-${state.theme}`);
}

function applyNativeResolutionLimit(imgEl) {
  if (!imgEl) return;
  const update = () => {
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;
    imgEl.style.maxWidth = `${imgEl.naturalWidth}px`;
    imgEl.style.maxHeight = `${imgEl.naturalHeight}px`;
  };
  if (!imgEl.__nativeLimitBound) {
    imgEl.addEventListener('load', update);
    imgEl.__nativeLimitBound = true;
  }
  update();
}

function getEffectiveMansorySize() {
  if (state.mansorySizeMode === 'custom') return state.mansorySize;
  const usableWidth = Math.max(320, window.innerWidth - 80);
  const targetCols = Math.max(2, Math.min(6, Math.round(usableWidth / 300)));
  return Math.max(120, Math.min(520, Math.round((usableWidth - ((targetCols - 1) * 10)) / targetCols)));
}

function syncMansorySizeControlState() {
  if (!mansorySizeInputEl) return;
  const autoMode = state.mansorySizeMode === 'auto';
  mansorySizeInputEl.disabled = autoMode;
  if (autoMode) mansorySizeInputEl.value = String(getEffectiveMansorySize());
}

function getPageSize() {
  if (state.layout === 'title') {
    return Math.max(1, state.titleRows * state.titleCols);
  }
  if (state.layout === 'mansory') {
    const usableWidth = Math.max(320, window.innerWidth - 80);
    const size = getEffectiveMansorySize();
    const cols = Math.max(1, Math.floor(usableWidth / (size + 14)));
    return Math.max(1, cols * 2);
  }
  return 1;
}

function buildVisibleSlides() {
  const pageSize = getPageSize();
  const out = [];
  for (let i = 0; i < pageSize; i += 1) {
    const idx = (state.index + i) % config.slides.length;
    out.push({ idx, slide: config.slides[idx] });
  }
  return out;
}

function renderSingleSlide() {
  const slide = config.slides[state.index];
  if (!slide) return;
  slideImageEl.src = String(slide.path || '');
  slideImageEl.alt = String(slide.name || 'slide');
  applyNativeResolutionLimit(slideImageEl);
  applyEffect();
  slideMetaEl.textContent = `${state.index + 1}/${config.slides.length} ${slide.name ? `| ${slide.name}` : ''}`;
  if (state.showCaption && slide.caption) {
    slideCaptionEl.hidden = false;
    slideCaptionEl.textContent = String(slide.caption);
  } else {
    slideCaptionEl.hidden = true;
    slideCaptionEl.textContent = '';
  }
}

function renderGridSlides() {
  if (!slideGridEl) return;
  const visible = buildVisibleSlides();
  slideGridEl.innerHTML = '';
  slideGridEl.className = `player-grid layout-${state.layout}`;
  slideGridEl.style.setProperty('--title-cols', String(state.titleCols));
  slideGridEl.style.setProperty('--title-rows', String(state.titleRows));
  slideGridEl.style.setProperty('--mansory-size', `${getEffectiveMansorySize()}px`);

  visible.forEach(({ slide }) => {
    if (!slide) return;
    const card = document.createElement('figure');
    card.className = 'player-grid-item';
    const img = document.createElement('img');
    img.className = `player-grid-image effect-${state.effect}`;
    img.src = String(slide.path || '');
    img.alt = String(slide.name || 'slide');
    applyNativeResolutionLimit(img);
    card.appendChild(img);

    if (state.showCaption && slide.caption) {
      const cap = document.createElement('figcaption');
      cap.className = 'player-grid-caption';
      cap.textContent = String(slide.caption);
      card.appendChild(cap);
    }
    slideGridEl.appendChild(card);
  });

  const first = visible[0]?.idx ?? 0;
  slideMetaEl.textContent = `Showing ${visible.length} slides | Start ${first + 1}/${config.slides.length}`;
  slideCaptionEl.hidden = true;
  slideCaptionEl.textContent = '';
}

function updateLayoutUI() {
  const isSingle = state.layout === 'single';
  if (titleRowsWrapEl) titleRowsWrapEl.hidden = state.layout !== 'title';
  if (titleColsWrapEl) titleColsWrapEl.hidden = state.layout !== 'title';
  if (mansorySizeWrapEl) mansorySizeWrapEl.hidden = state.layout !== 'mansory';
  if (playerMediaEl) playerMediaEl.hidden = !isSingle;
  if (slideGridEl) slideGridEl.hidden = isSingle;
  syncMansorySizeControlState();
}

function setToolbarCollapsed(collapsed) {
  const next = Boolean(collapsed);
  document.body.classList.toggle('toolbar-collapsed', next);
  if (toolbarToggleCollapseEl) toolbarToggleCollapseEl.hidden = next;
  if (toolbarToggleExpandEl) toolbarToggleExpandEl.hidden = !next;
}

function renderSlide() {
  updateLayoutUI();
  if (state.layout === 'single') renderSingleSlide();
  else renderGridSlides();
}

function restartTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (!state.playing || config.slides.length <= 1) return;
  state.timer = setInterval(() => {
    const step = getPageSize();
    state.index = (state.index + step) % config.slides.length;
    renderSlide();
  }, state.speedSeconds * 1000);
}

function setPlaying(next) {
  state.playing = Boolean(next);
  togglePlayEl.textContent = state.playing ? 'Pause' : 'Play';
  restartTimer();
}

function move(delta) {
  const step = getPageSize();
  state.index = (state.index + (delta * step) + config.slides.length) % config.slides.length;
  renderSlide();
  restartTimer();
}

function startMusic() {
  if (!state.musicTracks.length) return;
  const src = state.musicTracks[state.musicIndex];
  bgmEl.src = src;
  bgmEl.play().catch(() => {});
}

bgmEl.addEventListener('ended', () => {
  if (!state.musicTracks.length) return;
  state.musicIndex = (state.musicIndex + 1) % state.musicTracks.length;
  startMusic();
});

togglePlayEl.addEventListener('click', () => setPlaying(!state.playing));
prevSlideEl.addEventListener('click', () => move(-1));
nextSlideEl.addEventListener('click', () => move(1));
speedInputEl.addEventListener('change', () => {
  state.speedSeconds = clampNumber(speedInputEl.value || 5, 1, 30, 5);
  speedInputEl.value = String(state.speedSeconds);
  restartTimer();
});
effectInputEl.addEventListener('change', () => {
  state.effect = String(effectInputEl.value || 'fade');
  renderSlide();
});
themeInputEl?.addEventListener('change', () => {
  state.theme = normalizeTheme(themeInputEl.value);
  applyTheme();
});
layoutInputEl?.addEventListener('change', () => {
  state.layout = normalizeLayout(layoutInputEl.value);
  renderSlide();
  restartTimer();
});
titleRowsInputEl?.addEventListener('change', () => {
  state.titleRows = clampNumber(titleRowsInputEl.value || 2, 1, 6, 2);
  titleRowsInputEl.value = String(state.titleRows);
  renderSlide();
  restartTimer();
});
titleColsInputEl?.addEventListener('change', () => {
  state.titleCols = clampNumber(titleColsInputEl.value || 3, 1, 8, 3);
  titleColsInputEl.value = String(state.titleCols);
  renderSlide();
  restartTimer();
});
mansorySizeInputEl?.addEventListener('change', () => {
  state.mansorySize = clampNumber(mansorySizeInputEl.value || 220, 120, 520, 220);
  mansorySizeInputEl.value = String(state.mansorySize);
  renderSlide();
  restartTimer();
});
mansorySizeModeInputEl?.addEventListener('change', () => {
  state.mansorySizeMode = String(mansorySizeModeInputEl.value || 'custom') === 'auto' ? 'auto' : 'custom';
  syncMansorySizeControlState();
  renderSlide();
  restartTimer();
});
musicToggleEl.addEventListener('click', () => {
  state.musicOn = !state.musicOn;
  if (state.musicOn) {
    startMusic();
    musicToggleEl.textContent = 'Music On';
  } else {
    bgmEl.pause();
    musicToggleEl.textContent = 'Music Off';
  }
});
fullscreenBtnEl.addEventListener('click', () => {
  const el = document.documentElement;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }
});
toolbarToggleCollapseEl?.addEventListener('click', () => {
  setToolbarCollapsed(true);
});
toolbarToggleExpandEl?.addEventListener('click', () => {
  setToolbarCollapsed(false);
});
backBtnEl?.addEventListener('click', () => {
  if (window.opener && !window.opener.closed) {
    window.close();
    return;
  }
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = '/slideshow.html';
});
window.addEventListener('resize', () => {
  if (state.layout === 'mansory') renderSlide();
});

renderSlide();
applyTheme();
setToolbarCollapsed(false);
setPlaying(true);
