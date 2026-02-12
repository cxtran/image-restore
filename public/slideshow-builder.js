async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const ctype = res.headers.get('content-type') || '';
  const body = ctype.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error((body && (body.error || body.message)) || `HTTP ${res.status}`);
  return body;
}

const state = {
  user: null,
  availableShared: [],
  availableMine: [],
  selected: [],
  music: [],
  selectedMusic: [],
  privateShows: [],
  sourceMode: 'mine',
  myAlbumFilter: 'all',
  editingPrivateId: null,
  draggingSelectedKey: null,
  suppressCardClick: false,
  pendingDeleteId: null,
  pendingDeleteName: ''
};

const heroUserEl = document.getElementById('heroUser');
const heroLogoutBtnEl = document.getElementById('heroLogout');
const availableGridEl = document.getElementById('availableGrid');
const selectedGridEl = document.getElementById('selectedGrid');
const selectedCountEl = document.getElementById('selectedCount');
const builderStatusEl = document.getElementById('builderStatus');
const searchSharedEl = document.getElementById('searchShared');
const sourceModeEl = document.getElementById('sourceMode');
const myAlbumFilterEl = document.getElementById('myAlbumFilter');
const musicGridEl = document.getElementById('musicGrid');
const musicUploadEl = document.getElementById('musicUpload');
const privateListEl = document.getElementById('privateList');
const createSlideshowModalEl = document.getElementById('createSlideshowModal');
const modalTitleEl = document.getElementById('modalTitle');
const savePrivateBtnEl = document.getElementById('savePrivate');
const slideshowNameEl = document.getElementById('slideshowName');
const deleteSlideshowModalEl = document.getElementById('deleteSlideshowModal');
const deleteSlideshowMessageEl = document.getElementById('deleteSlideshowMessage');

function log(msg) {
  if (builderStatusEl) builderStatusEl.textContent = String(msg || '');
}

function setUserUI(user) {
  state.user = user || null;
  if (heroUserEl) {
    heroUserEl.textContent = user && user.email ? `Signed in as ${user.email}` : '';
    heroUserEl.hidden = !(user && user.email);
  }
  if (heroLogoutBtnEl) {
    heroLogoutBtnEl.hidden = !(user && user.email);
  }
}

function toSlideKey(row) {
  return `${row.image_id}:${row.version_num}`;
}

function buildRuntimeConfig() {
  const now = new Date();
  const typedName = String(slideshowNameEl?.value || '').trim();
  const name = typedName || `Slideshow ${now.toISOString().slice(0, 19).replace('T', ' ')}`;
  const speed = 5;
  const effect = 'fade';
  const showCaption = false;
  return {
    name,
    speedSeconds: speed,
    effect,
    showCaption,
    slides: state.selected.map((x) => ({ ...x })),
    music: state.selectedMusic.map((x) => ({ ...x }))
  };
}

function renderSelected() {
  if (!selectedGridEl) return;
  selectedGridEl.innerHTML = '';
  if (selectedCountEl) selectedCountEl.textContent = `Slides: ${state.selected.length}`;

  state.selected.forEach((row) => {
    const card = document.createElement('div');
    card.className = 'slideshow-card selected';
    card.draggable = true;
    card.dataset.key = row.key;
    card.innerHTML = `
      <div class="slideshow-film-frame">
        <img src="${row.path}" alt="${row.name || 'slide'}" loading="lazy" />
      </div>
    `;
    card.addEventListener('click', () => {
      if (state.suppressCardClick) return;
      const selectedIndex = state.selected.findIndex((x) => x.key === row.key);
      if (selectedIndex >= 0) {
        state.selected.splice(selectedIndex, 1);
      }
      renderSelected();
      renderAvailable();
    });
    card.addEventListener('dragstart', (e) => {
      state.draggingSelectedKey = row.key;
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.key);
      }
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      state.draggingSelectedKey = null;
      state.suppressCardClick = true;
      setTimeout(() => {
        state.suppressCardClick = false;
      }, 120);
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!state.draggingSelectedKey || state.draggingSelectedKey === row.key) return;
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const draggingKey = state.draggingSelectedKey || e.dataTransfer?.getData('text/plain');
      if (!draggingKey || draggingKey === row.key) return;
      const fromIndex = state.selected.findIndex((x) => x.key === draggingKey);
      const toIndex = state.selected.findIndex((x) => x.key === row.key);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      const [moved] = state.selected.splice(fromIndex, 1);
      state.selected.splice(toIndex, 0, moved);
      state.suppressCardClick = true;
      setTimeout(() => {
        state.suppressCardClick = false;
      }, 120);
      renderSelected();
      renderAvailable();
    });
    selectedGridEl.appendChild(card);
  });

}

function renderAvailable() {
  if (!availableGridEl) return;
  availableGridEl.innerHTML = '';

  const q = String(searchSharedEl?.value || '').trim().toLowerCase();
  let sourceRows = state.sourceMode === 'shared' ? state.availableShared : state.availableMine;
  if (state.sourceMode === 'mine' && state.myAlbumFilter !== 'all') {
    if (state.myAlbumFilter === 'none') {
      sourceRows = sourceRows.filter((row) => !row.album_id);
    } else if (state.myAlbumFilter.startsWith('id:')) {
      const albumId = Number(state.myAlbumFilter.slice(3));
      sourceRows = sourceRows.filter((row) => Number(row.album_id) === albumId);
    }
  }
  const selectedSet = new Set(state.selected.map((x) => x.key));
  sourceRows
    .filter((row) => {
      if (selectedSet.has(row.key)) return false;
      if (!q) return true;
      const hay = `${row.name} ${row.caption} ${row.owner}`.toLowerCase();
      return hay.includes(q);
    })
    .forEach((row) => {
      const card = document.createElement('div');
      card.className = 'slideshow-card';
      card.innerHTML = `
        <div class="slideshow-film-frame">
          <img src="${row.path}" alt="${row.name || 'slide'}" loading="lazy" />
        </div>
      `;
      card.addEventListener('click', () => {
        if (state.suppressCardClick) return;
        state.selected.push({ ...row });
        renderAvailable();
        renderSelected();
      });
      availableGridEl.appendChild(card);
    });
}

function renderMusic() {
  if (!musicGridEl) return;
  musicGridEl.innerHTML = '';
  const selectedSet = new Set(state.selectedMusic.map((x) => x.name));
  state.music.forEach((track) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `music-tile ${selectedSet.has(track.name) ? 'selected' : ''}`;
    tile.textContent = track.name;
    tile.addEventListener('click', () => {
      const idx = state.selectedMusic.findIndex((x) => x.name === track.name);
      if (idx >= 0) state.selectedMusic.splice(idx, 1);
      else state.selectedMusic.push(track);
      renderMusic();
    });
    musicGridEl.appendChild(tile);
  });
}

function renderPrivateList() {
  if (!privateListEl) return;
  privateListEl.innerHTML = '';
  if (!state.privateShows.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No private slideshows yet.';
    privateListEl.appendChild(empty);
    return;
  }
  state.privateShows.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'private-item';
    const modified = item.updated_at ? new Date(item.updated_at).toLocaleString() : '-';
    card.innerHTML = `
      <h3>${item.name || 'Private Slideshow'}</h3>
      <p>Slides: ${Number(item.slide_count || 0)}</p>
      <p>Updated: ${modified}</p>
      <div class="slideshow-card-actions">
        <button type="button" data-action="modify">Modify</button>
        <button type="button" class="ghost" data-action="play">Play</button>
        <button type="button" class="ghost danger" data-action="delete">Delete</button>
      </div>
    `;
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'modify') {
        modifyPrivateShow(item.id).catch((err) => log(err.message));
      } else if (action === 'play') {
        playPrivateShow(item.id).catch((err) => log(err.message));
      } else if (action === 'delete') {
        openDeleteSlideshowModal(item.id, item.name);
      }
    });
    privateListEl.appendChild(card);
  });
}

function syncMyAlbumFilterOptions() {
  if (!myAlbumFilterEl) return;
  const counts = new Map();
  let uncategorizedCount = 0;
  state.availableMine.forEach((row) => {
    if (row.album_id) {
      const key = `id:${row.album_id}`;
      const entry = counts.get(key) || { name: row.album || `Album ${row.album_id}`, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    } else {
      uncategorizedCount += 1;
    }
  });

  myAlbumFilterEl.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = `All Albums (${state.availableMine.length})`;
  myAlbumFilterEl.appendChild(allOpt);

  if (uncategorizedCount > 0) {
    const noneOpt = document.createElement('option');
    noneOpt.value = 'none';
    noneOpt.textContent = `Uncategorized (${uncategorizedCount})`;
    myAlbumFilterEl.appendChild(noneOpt);
  }

  [...counts.entries()]
    .sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)))
    .forEach(([key, data]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${data.name} (${data.count})`;
      myAlbumFilterEl.appendChild(opt);
    });

  const valid = Array.from(myAlbumFilterEl.options).some((o) => o.value === state.myAlbumFilter);
  state.myAlbumFilter = valid ? state.myAlbumFilter : 'all';
  myAlbumFilterEl.value = state.myAlbumFilter;
  myAlbumFilterEl.hidden = state.sourceMode !== 'mine';
}

async function loadSharedSlides() {
  const rows = await api('/api/images/shared');
  const flat = [];
  rows.forEach((img) => {
    (img.versions || []).forEach((v) => {
      if (!v || !v.file_path) return;
      const row = {
        key: `${img.id}:${v.version_num}`,
        image_id: Number(img.id),
        version_num: Number(v.version_num),
        path: String(v.file_path),
        name: String(img.original_name || ''),
        caption: String(img.caption || ''),
        owner: String(img.owner_email || '')
      };
      flat.push(row);
    });
  });
  state.availableShared = flat;
}

async function loadMySlides() {
  const rows = await api('/api/images');
  const flat = [];
  rows.forEach((img) => {
    (img.versions || []).forEach((v) => {
      if (!v || !v.file_path) return;
      flat.push({
        key: `${img.id}:${v.version_num}`,
        image_id: Number(img.id),
        version_num: Number(v.version_num),
        path: String(v.file_path),
        name: String(img.original_name || ''),
        caption: String(img.caption || ''),
        owner: String(state.user?.email || ''),
        album: String(img.album_name || ''),
        album_id: img.album_id ? Number(img.album_id) : null
      });
    });
  });
  state.availableMine = flat;
  syncMyAlbumFilterOptions();
}

async function loadMusic() {
  state.music = await api('/api/slideshow/music');
  state.selectedMusic = state.selectedMusic.filter((x) => state.music.some((m) => m.name === x.name));
}

async function loadPrivateShows() {
  state.privateShows = await api('/api/slideshow/private');
}

async function requireLogin() {
  try {
    const user = await api('/api/auth/me');
    setUserUI(user);
  } catch (_err) {
    const nextPath = `${window.location.pathname}${window.location.search || ''}`;
    window.location.href = `/login.html?next=${encodeURIComponent(nextPath)}`;
  }
}

function resetBuilderSelection() {
  state.selected = [];
  state.selectedMusic = [];
  state.sourceMode = 'mine';
  state.myAlbumFilter = 'all';
  if (slideshowNameEl) slideshowNameEl.value = '';
  if (sourceModeEl) sourceModeEl.value = 'mine';
  syncMyAlbumFilterOptions();
  renderSelected();
  renderAvailable();
  renderMusic();
}

function openCreateModal() {
  state.editingPrivateId = null;
  if (modalTitleEl) modalTitleEl.textContent = 'Create Slideshow';
  if (savePrivateBtnEl) savePrivateBtnEl.textContent = 'Save';
  resetBuilderSelection();
  if (createSlideshowModalEl) createSlideshowModalEl.hidden = false;
}

function closeCreateModal() {
  if (createSlideshowModalEl) createSlideshowModalEl.hidden = true;
}

function openOnlinePlayer() {
  if (!state.selected.length) {
    log('Select at least one slide.');
    return;
  }
  const config = buildRuntimeConfig();
  const key = `slideshow_config_${Date.now()}`;
  localStorage.setItem(key, JSON.stringify(config));
  window.open(`/slideshow-player.html?cfg=${encodeURIComponent(key)}`, '_blank');
}

function openOfflinePlayer() {
  if (!state.selected.length) {
    log('Select at least one slide.');
    return;
  }
  const config = buildRuntimeConfig();
  localStorage.setItem('offline_slideshow_config', JSON.stringify(config));
  window.open('/slideshow-player-offline.html', '_blank');
}

async function downloadOfflineHtml() {
  if (!state.selected.length) {
    log('Select at least one slide.');
    return;
  }
  const config = buildRuntimeConfig();
  const template = await fetch('/slideshow-player-offline.html', { credentials: 'include' }).then((r) => r.text());
  const payload = JSON.stringify(config).replace(/</g, '\\u003c');
  const html = template.replace(
    'window.OFFLINE_SLIDESHOW_DATA = null;',
    `window.OFFLINE_SLIDESHOW_DATA = ${payload};`
  );
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(config.name || 'slideshow').replace(/[^\w\-]+/g, '_')}.offline.html`;
  a.click();
  URL.revokeObjectURL(url);
}

async function uploadMusic() {
  const file = musicUploadEl?.files?.[0];
  if (!file) {
    log('Choose a music file first.');
    return;
  }
  const form = new FormData();
  form.append('music', file);
  await api('/api/slideshow/music/upload', { method: 'POST', body: form });
  musicUploadEl.value = '';
  await loadMusic();
  renderMusic();
  log('Music uploaded.');
}

async function savePrivateShow() {
  if (!state.selected.length) {
    log('Select at least one slide before saving.');
    return;
  }
  const config = buildRuntimeConfig();
  const editing = Number(state.editingPrivateId);
  const isEditing = Number.isInteger(editing) && editing > 0;
  const data = await api(
    isEditing
      ? `/api/slideshow/private/${encodeURIComponent(editing)}`
      : '/api/slideshow/private',
    {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    }
  );
  await loadPrivateShows();
  renderPrivateList();
  closeCreateModal();
  log(isEditing
    ? `Updated private slideshow: ${data.name || editing}`
    : `Saved private slideshow: ${data.name || data.id}`);
}

async function loadPrivateShow(id) {
  const data = await api(`/api/slideshow/private/${encodeURIComponent(id)}`);
  const cfg = data?.config || null;
  if (!cfg || !Array.isArray(cfg.slides)) {
    throw new Error('Invalid private slideshow config');
  }
  state.selected = cfg.slides.map((x) => ({ ...x }));
  state.selectedMusic = Array.isArray(cfg.music) ? cfg.music.map((x) => ({ ...x })) : [];
  if (slideshowNameEl) {
    slideshowNameEl.value = String(cfg.name || data?.name || '').trim();
  }
  syncMyAlbumFilterOptions();
  renderSelected();
  renderAvailable();
  renderMusic();
  log(`Loaded private slideshow: ${data.name || id}`);
}

async function modifyPrivateShow(id) {
  await loadPrivateShow(id);
  state.editingPrivateId = Number(id);
  if (modalTitleEl) modalTitleEl.textContent = 'Modify Slideshow';
  if (savePrivateBtnEl) savePrivateBtnEl.textContent = 'Update Slideshow';
  if (createSlideshowModalEl) createSlideshowModalEl.hidden = false;
}

async function playPrivateShow(id) {
  const data = await api(`/api/slideshow/private/${encodeURIComponent(id)}`);
  const cfg = data?.config || null;
  if (!cfg || !Array.isArray(cfg.slides) || !cfg.slides.length) {
    throw new Error('Private slideshow has no slides');
  }
  const key = `slideshow_config_${Date.now()}`;
  localStorage.setItem(key, JSON.stringify(cfg));
  window.open(`/slideshow-player.html?cfg=${encodeURIComponent(key)}`, '_blank');
}

async function deletePrivateShow(id) {
  log('Deleting private slideshow...');
  await api(`/api/slideshow/private/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadPrivateShows();
  renderPrivateList();
  log('Private slideshow deleted.');
}

function openDeleteSlideshowModal(id, name) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 1) return;
  state.pendingDeleteId = numericId;
  state.pendingDeleteName = String(name || '').trim();
  if (deleteSlideshowMessageEl) {
    deleteSlideshowMessageEl.textContent = state.pendingDeleteName
      ? `Delete "${state.pendingDeleteName}"? This action cannot be undone.`
      : 'Are you sure you want to delete this slideshow? This action cannot be undone.';
  }
  if (deleteSlideshowModalEl) deleteSlideshowModalEl.hidden = false;
}

function closeDeleteSlideshowModal() {
  if (deleteSlideshowModalEl) deleteSlideshowModalEl.hidden = true;
  state.pendingDeleteId = null;
  state.pendingDeleteName = '';
}

async function confirmDeleteSlideshow() {
  const id = Number(state.pendingDeleteId);
  if (!Number.isInteger(id) || id < 1) {
    closeDeleteSlideshowModal();
    return;
  }
  try {
    await deletePrivateShow(id);
  } finally {
    closeDeleteSlideshowModal();
  }
}

if (heroLogoutBtnEl) {
  heroLogoutBtnEl.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (_err) {
      // ignore
    }
    window.location.href = '/login.html';
  });
}

document.getElementById('openCreateModal')?.addEventListener('click', () => {
  openCreateModal();
});
document.getElementById('closeCreateModal')?.addEventListener('click', () => {
  closeCreateModal();
});
if (createSlideshowModalEl) {
  createSlideshowModalEl.addEventListener('click', (e) => {
    if (e.target === createSlideshowModalEl) closeCreateModal();
  });
}
document.getElementById('cancelDeleteSlideshow')?.addEventListener('click', () => {
  closeDeleteSlideshowModal();
});
document.getElementById('confirmDeleteSlideshow')?.addEventListener('click', () => {
  confirmDeleteSlideshow().catch((e) => log(e.message));
});
if (deleteSlideshowModalEl) {
  deleteSlideshowModalEl.addEventListener('click', (e) => {
    if (e.target === deleteSlideshowModalEl) closeDeleteSlideshowModal();
  });
}

document.getElementById('refreshMusic')?.addEventListener('click', () => {
  loadMusic().then(renderMusic).catch((e) => log(e.message));
});
document.getElementById('uploadMusic')?.addEventListener('click', () => {
  uploadMusic().catch((e) => log(e.message));
});
document.getElementById('savePrivate')?.addEventListener('click', () => {
  savePrivateShow().catch((e) => log(e.message));
});
document.getElementById('refreshPrivate')?.addEventListener('click', () => {
  loadPrivateShows().then(renderPrivateList).catch((e) => log(e.message));
});
document.getElementById('playSlideshow')?.addEventListener('click', openOnlinePlayer);
document.getElementById('playOffline')?.addEventListener('click', openOfflinePlayer);
document.getElementById('downloadOffline')?.addEventListener('click', () => {
  downloadOfflineHtml().catch((e) => log(e.message));
});
document.getElementById('clearSlides')?.addEventListener('click', () => {
  resetBuilderSelection();
});
if (searchSharedEl) {
  searchSharedEl.addEventListener('input', renderAvailable);
}
if (sourceModeEl) {
  sourceModeEl.value = state.sourceMode;
  sourceModeEl.addEventListener('change', () => {
    state.sourceMode = String(sourceModeEl.value || 'mine') === 'shared' ? 'shared' : 'mine';
    syncMyAlbumFilterOptions();
    renderAvailable();
  });
}
if (myAlbumFilterEl) {
  myAlbumFilterEl.addEventListener('change', () => {
    state.myAlbumFilter = String(myAlbumFilterEl.value || 'all');
    renderAvailable();
  });
}

if (selectedGridEl) {
  selectedGridEl.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  selectedGridEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetCard = e.target.closest('.slideshow-card.selected');
    if (targetCard) return;
    const draggingKey = state.draggingSelectedKey || e.dataTransfer?.getData('text/plain');
    if (!draggingKey) return;
    const fromIndex = state.selected.findIndex((x) => x.key === draggingKey);
    if (fromIndex < 0 || fromIndex === state.selected.length - 1) return;
    const [moved] = state.selected.splice(fromIndex, 1);
    state.selected.push(moved);
    state.suppressCardClick = true;
    setTimeout(() => {
      state.suppressCardClick = false;
    }, 120);
    renderSelected();
    renderAvailable();
  });
}

requireLogin()
  .then(async () => {
    await Promise.all([loadSharedSlides(), loadMySlides(), loadMusic(), loadPrivateShows()]);
    renderAvailable();
    renderSelected();
    renderMusic();
    renderPrivateList();
    closeCreateModal();
    log('Loaded private slideshows.');
  })
  .catch(() => {});
