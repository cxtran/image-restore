const state = { token: localStorage.getItem("token") || "" };

function setStatus(msg) {
  document.getElementById("auth-status").textContent = msg;
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch {}
    throw new Error(detail);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response;
}

async function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  await api("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  setStatus("Registered. You can log in now.");
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const data = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  state.token = data.access_token;
  localStorage.setItem("token", state.token);
  setStatus("Logged in");
}

async function logout() {
  if (state.token) {
    await api("/api/auth/logout", { method: "POST" });
  }
  state.token = "";
  localStorage.removeItem("token");
  setStatus("Logged out");
}

async function uploadImage() {
  const fileInput = document.getElementById("file-input");
  if (!fileInput.files.length) throw new Error("Select an image first");
  const form = new FormData();
  form.append("file", fileInput.files[0]);
  const img = await api("/api/images/upload", { method: "POST", body: form });
  setStatus(`Uploaded image ${img.id}`);
  await refreshImages();
}

async function processImage() {
  const imageId = Number(document.getElementById("image-id").value);
  const payload = {
    upscale: document.getElementById("upscale").checked,
    face_restore: document.getElementById("face").checked,
    colorize: document.getElementById("colorize").checked,
    opencv: {
      sharpen: document.getElementById("sharpen").checked,
      denoise: document.getElementById("denoise").checked,
      contrast: Number(document.getElementById("contrast").value),
      saturation: Number(document.getElementById("saturation").value),
      gamma: Number(document.getElementById("gamma").value),
    },
  };
  const data = await api(`/api/images/${imageId}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  setStatus(`Processed image ${data.image_id} to version ${data.version}`);
  await refreshImages();
}

async function refreshImages() {
  const list = document.getElementById("images");
  list.innerHTML = "";
  const images = await api("/api/images");
  images.forEach((img) => {
    const li = document.createElement("li");
    li.textContent = `ID ${img.id} | ${img.original_name} | version ${img.current_version} | updated ${img.updated_at}`;
    list.appendChild(li);
  });
}

async function downloadImage() {
  const imageId = Number(document.getElementById("download-image-id").value);
  const version = document.getElementById("download-version").value;
  const params = version ? `?version=${encodeURIComponent(version)}` : "";
  const res = await api(`/api/images/${imageId}/download${params}`);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `restored_${imageId}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

document.getElementById("register-btn").addEventListener("click", () => register().catch((e) => setStatus(e.message)));
document.getElementById("login-btn").addEventListener("click", () => login().catch((e) => setStatus(e.message)));
document.getElementById("logout-btn").addEventListener("click", () => logout().catch((e) => setStatus(e.message)));
document.getElementById("upload-btn").addEventListener("click", () => uploadImage().catch((e) => setStatus(e.message)));
document.getElementById("process-btn").addEventListener("click", () => processImage().catch((e) => setStatus(e.message)));
document.getElementById("refresh-btn").addEventListener("click", () => refreshImages().catch((e) => setStatus(e.message)));
document.getElementById("download-btn").addEventListener("click", () => downloadImage().catch((e) => setStatus(e.message)));

if (state.token) {
  api("/api/auth/me")
    .then((u) => setStatus(`Logged in as ${u.email}`))
    .catch(() => setStatus("Saved token invalid, log in again"));
}
