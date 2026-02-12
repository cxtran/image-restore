const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const db = require('./db');

if (!process.env.DB_HOST) {
  dotenv.config({ path: path.join(__dirname, '.env') });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});
const PORT = process.env.PORT || 4011;
app.set('io', io);
const publicDir = path.join(__dirname, 'public');
const indexTemplatePath = path.join(publicDir, 'index.html');
const loginTemplatePath = path.join(publicDir, 'login.html');
const adminTemplatePath = path.join(publicDir, 'admin.html');
const yourImagesTemplatePath = path.join(publicDir, 'your-images.html');
const sharedImagesTemplatePath = path.join(publicDir, 'shared-images.html');
const slideshowTemplatePath = path.join(publicDir, 'slideshow.html');

['./uploads', './data'].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function getAssetVersion() {
  const files = [
    'index.html',
    'login.html',
    'your-images.html',
    'shared-images.html',
    'slideshow.html',
    'app.js',
    'login.js',
    'slideshow.js',
    'styles.css'
  ];
  const latestMs = files.reduce((max, file) => {
    try {
      const stat = fs.statSync(path.join(publicDir, file));
      return Math.max(max, Math.floor(stat.mtimeMs));
    } catch (_error) {
      return max;
    }
  }, 0);
  return latestMs || Date.now();
}

function serveTemplateWithVersion(templatePath, errorMessage) {
  return (_req, res) => {
    fs.readFile(templatePath, 'utf8', (err, html) => {
      if (err) return res.status(500).send(errorMessage);
      const version = String(getAssetVersion());
      return res.type('html').send(html.replaceAll('__ASSET_VERSION__', version));
    });
  };
}

const serveIndexWithVersion = serveTemplateWithVersion(indexTemplatePath, 'Failed to load UI');
const serveLoginWithVersion = serveTemplateWithVersion(loginTemplatePath, 'Failed to load login UI');
const serveAdminWithVersion = serveTemplateWithVersion(adminTemplatePath, 'Failed to load admin UI');
const serveYourImagesWithVersion = serveTemplateWithVersion(yourImagesTemplatePath, 'Failed to load your images UI');
const serveSharedImagesWithVersion = serveTemplateWithVersion(sharedImagesTemplatePath, 'Failed to load shared images UI');
const serveSlideshowWithVersion = serveTemplateWithVersion(slideshowTemplatePath, 'Failed to load slideshow UI');

app.get('/', serveLoginWithVersion);
app.get('/login.html', serveLoginWithVersion);
app.get('/index.html', serveIndexWithVersion);
app.get('/your-images.html', serveYourImagesWithVersion);
app.get('/shared-images.html', serveSharedImagesWithVersion);
app.get('/slideshow.html', serveSlideshowWithVersion);
app.get('/admin.html', serveAdminWithVersion);
app.use(express.static(publicDir));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/images', require('./routes/images'));
app.use('/api/admin', require('./routes/admin'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

io.on('connection', (socket) => {
  socket.emit('socket-ready', { socketId: socket.id });
});

async function ensureRoleColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM users LIKE 'role'");
  if (rows.length === 0) {
    await db.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'");
  }
  await db.query("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''");
}

async function ensureForcePasswordColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM users LIKE 'force_password_change'");
  if (rows.length === 0) {
    await db.query('ALTER TABLE users ADD COLUMN force_password_change TINYINT(1) NOT NULL DEFAULT 0');
  }
}

async function ensureImageSharedColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM images LIKE 'is_shared'");
  if (rows.length === 0) {
    await db.query('ALTER TABLE images ADD COLUMN is_shared TINYINT(1) NOT NULL DEFAULT 0');
  }
}

async function ensureImageCaptionColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM images LIKE 'caption'");
  if (rows.length === 0) {
    await db.query('ALTER TABLE images ADD COLUMN caption TEXT NULL');
  }
}

async function ensureImageIconColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM images LIKE 'icon_path'");
  if (rows.length === 0) {
    await db.query('ALTER TABLE images ADD COLUMN icon_path TEXT NULL');
  }
}

async function ensureImageVersionSharedColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM image_versions LIKE 'is_shared'");
  if (rows.length === 0) {
    await db.query('ALTER TABLE image_versions ADD COLUMN is_shared TINYINT(1) NOT NULL DEFAULT 0');
  }
}

async function ensureAlbumsTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS albums (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_album_user_name (user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
}

async function ensureImageAlbumColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM images LIKE 'album_id'");
  if (rows.length === 0) {
    await db.query('ALTER TABLE images ADD COLUMN album_id INT NULL');
  }
}

async function bootstrap() {
  try {
    await ensureRoleColumn();
    await ensureForcePasswordColumn();
    await ensureImageSharedColumn();
    await ensureImageCaptionColumn();
    await ensureImageIconColumn();
    await ensureImageVersionSharedColumn();
    await ensureAlbumsTable();
    await ensureImageAlbumColumn();
    server.listen(PORT, () => {
      console.log(`Image Restore Studio running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
}

bootstrap();
