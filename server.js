// server.js (upgraded to handle missing mods.json blob by creating it on first use)
const express = require('express');
const multer = require('multer');
const path = require('path');
const { put, del, head } = require('@vercel/blob');
require('dotenv').config();

const app = express();
const METADATA_PATH = 'metadata/mods.json';

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

async function loadMods() {
  try {
    const metadataBlob = await head(METADATA_PATH);
    if (!metadataBlob) {
      // Create empty mods.json if it doesn't exist
      await put(METADATA_PATH, JSON.stringify([], null, 2), { access: 'public' });
      console.log('Created empty mods.json in Blob');
      return [];
    }
    const response = await fetch(metadataBlob.url);
    if (!response.ok) throw new Error('Failed to fetch metadata: ' + response.statusText);
    const text = await response.text();
    return JSON.parse(text);
  } catch (err) {
    console.error('Error loading mods:', err.message);
    return [];
  }
}

async function saveMods(mods) {
  try {
    const result = await put(METADATA_PATH, JSON.stringify(mods, null, 2), { access: 'public' });
    console.log('Mods saved successfully to:', result.url);
    return result;
  } catch (err) {
    console.error('Error saving mods:', err.message);
    throw err;
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
  if (mod) res.redirect(mod.downloadUrl);
  else res.status(404).json({ error: 'File not found' });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { name, description } = req.body;
  if (!name || !description) return res.status(400).json({ error: 'Name and description are required' });

  try {
    const blob = await put(req.file.originalname, req.file.buffer, { access: 'public', addRandomSuffix: true });
    const mods = await loadMods(); // This will create mods.json if missing
    mods.push({ name, description, pathname: blob.pathname, url: blob.url, downloadUrl: blob.downloadUrl });
    await saveMods(mods);
    res.json({ message: 'Mod uploaded successfully' });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/delete/:pathname', async (req, res) => {
  const { pathname } = req.params;
  try {
    const mods = await loadMods();
    const index = mods.findIndex(m => m.pathname === pathname);
    if (index === -1) return res.status(404).json({ error: 'Mod not found' });

    await del(mods[index].url);
    mods.splice(index, 1);
    await saveMods(mods);
    res.json({ message: 'Mod deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}

module.exports = app;