async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const ctype = res.headers.get('content-type') || '';
  const body = ctype.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error((body && (body.error || body.message)) || `HTTP ${res.status}`);
  return body;
}

const statusEl = document.getElementById('status');
function log(msg) { statusEl.textContent = String(msg); }

document.getElementById('register').onclick = async () => {
  try {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const data = await api('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    log(JSON.stringify(data, null, 2));
  } catch (e) { log(e.message); }
};

document.getElementById('login').onclick = async () => {
  try {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const data = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    log(JSON.stringify(data, null, 2));
  } catch (e) { log(e.message); }
};

document.getElementById('logout').onclick = async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); log('Logged out'); } catch (e) { log(e.message); }
};

document.getElementById('upload').onclick = async () => {
  try {
    const file = document.getElementById('photo').files[0];
    const form = new FormData();
    form.append('photo', file);
    const data = await api('/api/images/upload', { method: 'POST', body: form });
    log(JSON.stringify(data, null, 2));
  } catch (e) { log(e.message); }
};

document.getElementById('process').onclick = async () => {
  try {
    const imageId = Number(document.getElementById('imageId').value);
    const payload = {
      upscale: document.getElementById('upscale').checked,
      face_restore: document.getElementById('face').checked,
      colorize: document.getElementById('colorize').checked,
      opencv: {
        sharpen: document.getElementById('sharpen').checked,
        denoise: document.getElementById('denoise').checked,
        contrast: Number(document.getElementById('contrast').value || 1),
        saturation: Number(document.getElementById('saturation').value || 1),
        gamma: Number(document.getElementById('gamma').value || 1)
      }
    };
    const data = await api(`/api/images/${imageId}/process`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    log(JSON.stringify(data, null, 2));
  } catch (e) { log(e.message); }
};

document.getElementById('refresh').onclick = async () => {
  try {
    const data = await api('/api/images');
    const list = document.getElementById('images');
    list.innerHTML = '';
    data.forEach((row) => {
      const li = document.createElement('li');
      li.textContent = `ID ${row.id} | ${row.original_name} | version ${row.current_version}`;
      list.appendChild(li);
    });
    log('Loaded images');
  } catch (e) { log(e.message); }
};

document.getElementById('download').onclick = () => {
  const id = Number(document.getElementById('downId').value);
  const v = document.getElementById('downVersion').value;
  const q = v ? `?version=${encodeURIComponent(v)}` : '';
  window.location.href = `/api/images/${id}/download${q}`;
};
