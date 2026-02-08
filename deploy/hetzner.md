# Hetzner Deploy (Node/Express)

1. Provision Ubuntu 24.04 VM on Hetzner.
2. Install Docker + Compose.
3. Clone repo, then set secrets in `.env` and `docker-compose.yml`.
4. Initialize DB schema with `scripts/create_tables.sql`.
5. Start services: `docker compose up -d --build`.

Important env values:
- `JWT_SECRET`
- `DB_*`
- `REALESRGAN_CMD`
- `GFPGAN_CMD`
- `DEOLDIFY_CMD`
- `PYTHON_BIN`

Use Nginx/Caddy for TLS in front of `:4011`.
