const express = require('express');
const multer = require('multer');
const path = require('path');
const { put, del, head } = require('@vercel/blob');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// Configure metadata path in the blob store; default to metadata/mods.json
const METADATA_PATH = process.env.METADATA_PATH || 'metadata/mods.json';

// Ensure token is set for @vercel/blob - this package looks for BLOB_READ_WRITE_TOKEN
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.warn('Warning: BLOB_READ_WRITE_TOKEN not set. Blob operations will fail until you set it.');
}

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// Simple auth config (use env vars in production)
const ADMIN_USER = process.env.ADMIN_USER || 'AMAANE';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Amaane3grok';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const authCookieName = 'mgmods_auth';

function ensureAuth(req, res, next) {
  const token = req.cookies && req.cookies[authCookieName];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '12h' });
    // secure cookie in production, reasonable maxAge
    const cookieOpts = { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 };
    if (process.env.NODE_ENV === 'production') cookieOpts.secure = true;
    res.cookie(authCookieName, token, cookieOpts);
    return res.json({ message: 'ok' });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/logout', (req, res) => {
  res.clearCookie(authCookieName);
  res.json({ message: 'ok' });
});

async function loadMods() {
  // Try loading from Vercel Blob first
  try {
    const metadataBlob = await head(METADATA_PATH);
    if (metadataBlob && metadataBlob.url) {
      const response = await fetchWithRetry(metadataBlob.url, { timeout: 8000 }, 3);
      if (!response.ok) throw new Error('Failed to fetch metadata: ' + response.statusText);
      const text = await response.text();
      return JSON.parse(text);
    } else {
      // Only create empty metadata if blob truly does not exist
      await put(METADATA_PATH, JSON.stringify([], null, 2), { access: 'public' });
      console.log('Created empty metadata blob at', METADATA_PATH);
      return [];
    }
  } catch (err) {
    const msg = err && err.message ? err.message.toString() : '';
    if (msg.includes('requested blob does not exist') || msg.includes('BlobNotFoundError')) {
      try {
        await put(METADATA_PATH, JSON.stringify([], null, 2), { access: 'public' });
        console.log('Created empty metadata blob after missing error at', METADATA_PATH);
        return [];
      } catch (e) {
        console.error('Failed to create empty metadata blob after missing error:', e && e.message ? e.message : e);
        return [];
      }
    }
    // Other errors: log and continue with empty mods
    console.error('Error loading mods from blob:', msg);
    return [];
  }
}

// fetch with retries (exponential backoff)
async function fetchWithRetry(url, opts = {}, retries = 3, backoff = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      const wait = backoff * Math.pow(2, i);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

async function saveMods(mods) {
  const json = JSON.stringify(mods, null, 2);
  // Always save to the same metadata path, do not add random suffix
  const result = await put(METADATA_PATH, json, { access: 'public', addRandomSuffix: false });
  console.log('Mods saved successfully to blob at:', METADATA_PATH);
  return result;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/mods', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase().trim();
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10) || 50);
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);

    let mods = await loadMods();
    // server-side category filter
    const category = (req.query.category || '').toString().trim().toLowerCase();
    const version = (req.query.version || '').toString().trim();
    if (category && category !== 'all') {
      mods = mods.filter(m => (m.category || 'mod').toString().toLowerCase() === category);
    }
    if (version && version !== 'all') {
      mods = mods.filter(m => {
        const vs = m.versions || [];
        return vs.map(String).includes(version);
      });
    }
    if (q) {
      mods = mods.filter(m => {
        const hay = ((m.name || '') + ' ' + (m.description || '') + ' ' + (m.pathname || '') + ' ' + (m.filename || '')).toLowerCase();
        return hay.includes(q);
      });
    }
    const total = mods.length;
    mods = mods.slice(offset, offset + limit);
    console.log('Fetched mods:', mods.length, 'of', total);
    res.json({ total, limit, offset, results: mods });
  } catch (err) {
    console.error('Failed to load mods:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to load mods from blob' });
  }
});
app.get('/view/:pathname', (req, res) => res.sendFile(path.join(__dirname, 'public', 'view.html')));
app.get('/mod/:pathname', async (req, res) => {
  const mods = await loadMods();
  const mod = mods.find(m => m.pathname === req.params.pathname);
  if (mod) res.json(mod);
  else res.status(404).json({ error: 'Mod not found' });
});
app.get('/download/:pathname', async (req, res) => {
  const mods = await loadMods();
  const mod = mods.find(m => m.pathname === req.params.pathname);
  if (mod) {
    // If downloadUrl looks like a remote URL, redirect; otherwise send local file or path
    if (mod.downloadUrl && /^https?:\/\//i.test(mod.downloadUrl)) return res.redirect(mod.downloadUrl);
    // For local files, redirect to the relative path (served by /uploads)
    return res.redirect(mod.downloadUrl || `/uploads/${mod.pathname}`);
  }
  else res.status(404).json({ error: 'File not found' });
});

app.post('/upload', ensureAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { name, description } = req.body;
  // Accept category and versions from the form
  const category = (req.body.category || 'mod').toString();
  const versionsInput = req.body.versions || '';
  const versions = Array.isArray(versionsInput)
    ? versionsInput.map(v => v.toString().trim()).filter(Boolean)
    : versionsInput.toString().split(',').map(v => v.trim()).filter(Boolean);
  if (!name || !description) return res.status(400).json({ error: 'Name and description are required' });

  const mods = await loadMods(); // ensure we have the latest

  // Upload file to blob store (primary storage)
  try {
    const blob = await put(req.file.originalname, req.file.buffer, { access: 'public', addRandomSuffix: true });
    const entry = {
      name,
      description,
      category,
      versions,
      pathname: blob.pathname,
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      filename: req.file.originalname
    };
    mods.push(entry);
    await saveMods(mods); // Always updates metadata/mods.json
    return res.json({ message: 'Mod uploaded successfully (blob)', mod: entry });
  } catch (err) {
    console.error('Blob upload failed:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Blob upload failed: ' + (err && err.message ? err.message : String(err)) });
  }
});

app.delete('/delete/:pathname', ensureAuth, async (req, res) => {
  const { pathname } = req.params;
  try {
    const mods = await loadMods();
    const index = mods.findIndex(m => m.pathname === pathname || m.pathname === `/uploads/${pathname}`);
    if (index === -1) return res.status(404).json({ error: 'Mod not found' });

    const entry = mods[index];
    // Try deleting blob (if it is a remote URL)
    try {
      // prefer deleting by pathname if available
      const target = entry && entry.pathname ? entry.pathname : entry.url;
      if (target) {
        await del(target);
        console.log('Deleted blob at', target);
      }
    } catch (err) {
      console.error('Error deleting blob (ignored):', err && err.message ? err.message : err);
    }

    // If local file, remove it from uploads folder
    // no local files to clean in blob-only mode

    mods.splice(index, 1);
    await saveMods(mods);
    res.json({ message: 'Mod deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err && err.message ? err.message : err);
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}

module.exports = app;
