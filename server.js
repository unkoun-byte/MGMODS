const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const { put, del, head } = require('@vercel/blob');
require('dotenv').config();

const app = express();

// Allow configuring the metadata path via env; default to "mods.json" at repo root.
const METADATA_PATH = process.env.METADATA_PATH || 'mods.json';
const LOCAL_METADATA_FILE = path.join(__dirname, 'mods.json');
const TMP_METADATA_FILE = path.join(os.tmpdir(), 'mgmods_mods.json');

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname, 'public')));
// Serve local uploads if blob storage is not used or as a fallback
// Serve uploads from project uploads folder if writable, and also from system tmp as fallback
const PROJECT_UPLOADS = path.join(__dirname, 'uploads');
const TMP_UPLOADS = path.join(os.tmpdir(), 'mgmods_uploads');
app.use('/uploads', express.static(PROJECT_UPLOADS));
app.use('/uploads', express.static(TMP_UPLOADS));
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

async function loadMods() {
  // Try loading from Vercel Blob first
  try {
    const metadataBlob = await head(METADATA_PATH);
    if (metadataBlob && metadataBlob.url) {
      const response = await fetch(metadataBlob.url);
      if (!response.ok) throw new Error('Failed to fetch metadata: ' + response.statusText);
      const text = await response.text();
      return JSON.parse(text);
    }
    // If head returned nothing, fallthrough to local
    console.log('No metadata blob found at', METADATA_PATH);
  } catch (err) {
    // Common error: "The requested blob does not exist" - fall back to local file
    console.error('Error loading mods from blob:', err && err.message ? err.message : err);
  }

  // Fallback: load from local file system, or tmp metadata file
  try {
    const text = await fs.readFile(LOCAL_METADATA_FILE, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // create empty local metadata file if possible
      try {
        await fs.writeFile(LOCAL_METADATA_FILE, JSON.stringify([], null, 2), 'utf8');
        console.log('Created local mods.json at', LOCAL_METADATA_FILE);
        return [];
      } catch (e) {
        // fallback to tmp metadata
        await fs.writeFile(TMP_METADATA_FILE, JSON.stringify([], null, 2), 'utf8');
        console.log('Created tmp mods.json at', TMP_METADATA_FILE);
        return [];
      }
    }
    // If reading local file failed (e.g., EROFS), try tmp metadata
    console.error('Error reading local mods.json:', err.message || err, '- trying tmp');
    try {
      const text2 = await fs.readFile(TMP_METADATA_FILE, 'utf8');
      return JSON.parse(text2);
    } catch (e2) {
      if (e2.code === 'ENOENT') {
        try {
          await fs.writeFile(TMP_METADATA_FILE, JSON.stringify([], null, 2), 'utf8');
          console.log('Created tmp mods.json at', TMP_METADATA_FILE);
          return [];
        } catch (e3) {
          console.error('Unable to create tmp mods.json:', e3 && e3.message ? e3.message : e3);
          return [];
        }
      }
      console.error('Error reading tmp mods.json:', e2 && e2.message ? e2.message : e2);
      return [];
    }
  }
}

async function saveMods(mods) {
  const json = JSON.stringify(mods, null, 2);

  // Try saving to Vercel Blob, but if that fails, keep local copy updated.
  try {
    const result = await put(METADATA_PATH, json, { access: 'public' });
    console.log('Mods saved successfully to blob at:', result && result.url ? result.url : METADATA_PATH);
  } catch (err) {
    console.error('Error saving mods to blob:', err && err.message ? err.message : err);
  }

  // Write local copy if possible; otherwise write to tmp metadata file
  try {
    await fs.writeFile(LOCAL_METADATA_FILE, json, 'utf8');
    try { fsSync.chmodSync(LOCAL_METADATA_FILE, 0o644); } catch (e) { /* ignore */ }
    console.log('Local mods.json updated at', LOCAL_METADATA_FILE);
  } catch (err) {
    console.error('Error writing local mods.json (will try tmp):', err && err.message ? err.message : err);
    try {
      await fs.writeFile(TMP_METADATA_FILE, json, 'utf8');
      console.log('Tmp mods.json updated at', TMP_METADATA_FILE);
    } catch (err2) {
      console.error('Error writing tmp mods.json:', err2 && err2.message ? err2.message : err2);
      throw err2;
    }
  }
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/mods', async (req, res) => {
  const mods = await loadMods();
  console.log('Fetched mods:', mods); // Debug log
  res.json(mods);
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

  // Try uploading to the blob store first
  try {
    const blob = await put(req.file.originalname, req.file.buffer, { access: 'public', addRandomSuffix: true });
    mods.push({ name, description, pathname: blob.pathname, url: blob.url, downloadUrl: blob.downloadUrl });
    await saveMods(mods);
    return res.json({ message: 'Mod uploaded successfully (blob)', mod: mods[mods.length - 1] });
  } catch (err) {
    console.error('Blob upload failed, falling back to local storage:', err && err.message ? err.message : err);
  }

  // Fallback: save file locally in uploads/ and register it (try project uploads then tmp)
  try {
    const filename = `${Date.now()}-${req.file.originalname}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Ensure directories exist
    try { await fs.mkdir(PROJECT_UPLOADS, { recursive: true }); } catch(e) { /* ignore */ }
    try { await fs.mkdir(TMP_UPLOADS, { recursive: true }); } catch(e) { /* ignore */ }

    const destPathProject = path.join(PROJECT_UPLOADS, filename);
    let wroteTo = null;
    try {
      await fs.writeFile(destPathProject, req.file.buffer);
      wroteTo = 'project';
    } catch (err) {
      // If write failed (e.g., EROFS), try tmp dir
      console.error('Write to project uploads failed, falling back to tmp:', err && err.code ? err.code : err);
      try {
        const destPathTmp = path.join(TMP_UPLOADS, filename);
        await fs.writeFile(destPathTmp, req.file.buffer);
        wroteTo = 'tmp';
      } catch (err2) {
        console.error('Write to tmp uploads also failed:', err2 && err2.message ? err2.message : err2);
        throw err2;
      }
    }

    const entry = { name, description, pathname: filename, url: `/uploads/${filename}`, downloadUrl: `/uploads/${filename}` };
    mods.push(entry);
    await saveMods(mods);
    res.json({ message: `Mod uploaded successfully (local ${wroteTo})`, mod: entry });
  } catch (err) {
    console.error('Local upload error:', err && err.message ? err.message : err);
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
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
      if (entry && entry.url && /^https?:\/\//i.test(entry.url)) {
        await del(entry.url);
        console.log('Deleted blob at', entry.url);
      }
    } catch (err) {
      console.error('Error deleting blob (ignored):', err && err.message ? err.message : err);
    }

    // If local file, remove it from uploads folder
    try {
      if (entry && entry.downloadUrl && entry.downloadUrl.startsWith('/uploads/')) {
        const localPath = path.join(__dirname, entry.downloadUrl.replace(/^\/+/,'') );
        if (fsSync.existsSync(localPath)) fsSync.unlinkSync(localPath);
      }
    } catch (err) {
      console.error('Error deleting local file (ignored):', err && err.message ? err.message : err);
    }

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
