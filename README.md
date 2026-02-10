# Image Restore Studio (Lotus-style backend)
#

This app is structured similarly to `lotus-memories-db`:
- `controllers/`, `routes/`, `middlewares/`, `db.js`, `app.js`
- Cookie-based JWT login/logout with DB-backed users and sessions
- Upload -> process -> download workflow for restoration

## Features
- User register/login/logout (`/api/auth`)
- Upload/list/process/download images (`/api/images`)
- Processing pipeline:
  - Lotus-style API mode (recommended): set `ESRGAN_URL` (example: `https://restore.photokia.com` or `http://127.0.0.1:8000`)
  - Real-ESRGAN: upscaling
  - GFPGAN: face restoration
  - DeOldify: colorization
  - OpenCV enhancement
  - Local fallback mode is also supported via `REALESRGAN_CMD` / `GFPGAN_CMD` / `DEOLDIFY_CMD` + Python OpenCV script
- Live websocket progress updates during enhancement (Lotus-style progress bar)

## Latest UI/UX updates
- Image library now sorts by latest upload first (newest on top).
- Version view modal:
  - Hover the compare icon to preview original image.
  - If original is smaller than enhanced, original is shown as a framed overlay on top of a dimmed enhanced image.
- Enhancement modal:
  - Click the enhanced preview to open full-size image modal.
- Upload/crop modal:
  - Rotation controls added (rotate left/right and orientation slider with 1-degree steps).
- Upload file picker text is fully translatable in-app (custom picker, including Vietnamese labels like `Chọn ảnh` / `Chưa chọn ảnh`).
- Image deletion completion no longer shows a popup notification.

## Local setup
1. `cp .env.example .env`
2. Create MySQL/MariaDB database and run `scripts/create_tables.sql`
3. `npm install`
4. `npm start`
5. Open `http://localhost:4011`

## Restore API mode (same pattern as Lotus-memory)
Set this in `.env`:
`ESRGAN_URL=https://restore.photokia.com`

Backend enhancement flow:
- `POST {ESRGAN_URL}/api/restore`
- poll `GET {ESRGAN_URL}/api/status/{job_id}`
- download `GET {ESRGAN_URL}/api/download/{job_id}?stage=final`

## Local command fallback
Each command must include `{input}` and `{output}` placeholders.
Example:
`REALESRGAN_CMD=python inference_realesrgan.py -i {input} -o {output} -n RealESRGAN_x4plus`

## Hetzner deployment
Use `docker-compose.yml` on your Hetzner VM. Set strong secrets and DB passwords before deploy.

### Recommended Hetzner env file
1. Copy template: `cp .env.hetzner.example .env.hetzner`
2. Edit `.env.hetzner` with your Hetzner values (especially `JWT_SECRET`, `DB_*`, `ESRGAN_URL`)
3. Run:
   - `docker compose --env-file .env.hetzner up -d --build`
