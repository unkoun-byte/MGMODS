const express = require('express');
const multer = require('multer');
const path = require('path');
const { put, del, head } = require('@vercel/blob');
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
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

async function loadMods() {
  // Try loading from Vercel Blob first
  try {
    const metadataBlob = await head(METADATA_PATH);
    if (!metadataBlob) {
      // Create empty metadata blob
      await put(METADATA_PATH, JSON.stringify([], null, 2), { access: 'public' });
      console.log('Created empty metadata blob at', METADATA_PATH);
      return [];
    }
    if (metadataBlob && metadataBlob.url) {
      const response = await fetch(metadataBlob.url);
      if (!response.ok) throw new Error('Failed to fetch metadata: ' + response.statusText);
      const text = await response.text();
      return JSON.parse(text);
    }
  } catch (err) {
    // If the blob doesn't exist, create it and return empty array.
    const msg = err && err.message ? err.message.toString() : '';
    if (msg.includes('requested blob does not exist') || msg.includes('BlobNotFoundError')) {
      try {
        await put(METADATA_PATH, JSON.stringify([], null, 2), { access: 'public' });
        console.log('Created empty metadata blob after missing error at', METADATA_PATH);
        return [];
      } catch (e) {
        console.error('Failed to create empty metadata blob after missing error:', e && e.message ? e.message : e);
        throw e;
      }
    }
    // Other errors: log and rethrow
    console.error('Error loading mods from blob:', msg);
    throw err;
  }
}

async function saveMods(mods) {
  const json = JSON.stringify(mods, null, 2);
  // Save metadata to blob (single source of truth)
  const result = await put(METADATA_PATH, json, { access: 'public' });
  console.log('Mods saved successfully to blob at:', result && result.url ? result.url : METADATA_PATH);
  return result;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/mods', async (req, res) => {
  try {
    const mods = await loadMods();
    console.log('Fetched mods:', mods);
    res.json(mods);
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

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { name, description } = req.body;
  if (!name || !description) return res.status(400).json({ error: 'Name and description are required' });

  const mods = await loadMods(); // ensure we have the latest

  // Upload file to blob store (primary storage)
  try {
    const blob = await put(req.file.originalname, req.file.buffer, { access: 'public', addRandomSuffix: true });
    const entry = { name, description, pathname: blob.pathname, url: blob.url, downloadUrl: blob.downloadUrl };
    mods.push(entry);
    await saveMods(mods);
    return res.json({ message: 'Mod uploaded successfully (blob)', mod: entry });
  } catch (err) {
    console.error('Blob upload failed:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Blob upload failed: ' + (err && err.message ? err.message : String(err)) });
  }
});

app.delete('/delete/:pathname', async (req, res) => {
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
