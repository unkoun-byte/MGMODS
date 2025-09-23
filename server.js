const express = require('express');
const multer = require('multer');
const path = require('path');
const { put, del, head, list } = require('@vercel/blob'); // Import Blob SDK

const app = express();
const port = process.env.PORT || 3000; // Use Vercel PORT

const METADATA_PATH = 'metadata/mods.json'; // Fixed path for mods metadata in Blob

// Multer with memory storage (for buffer)
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(express.json());

// Helper to load mods from Blob
async function loadMods() {
  try {
    const metadataBlob = await head(METADATA_PATH);
    if (!metadataBlob) return [];
    const response = await fetch(metadataBlob.url);
    if (!response.ok) throw new Error('Failed to fetch metadata');
    const text = await response.text();
    return JSON.parse(text);
  } catch (err) {
    console.error('Error loading mods:', err);
    return [];
  }
}

// Helper to save mods to Blob
async function saveMods(mods) {
  try {
    await put(METADATA_PATH, JSON.stringify(mods, null, 2), { access: 'public' });
  } catch (err) {
    console.error('Error saving mods:', err);
    throw err;
  }
}

// Routes same, but updated for Blob...

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/mods', async (req, res) => {
  const mods = await loadMods();
  res.json(mods);
});

app.get('/view/:pathname', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

app.get('/mod/:pathname', async (req, res) => {
  const mods = await loadMods();
  const mod = mods.find(m => m.pathname === req.params.pathname);
  if (mod) {
    res.json(mod);
  } else {
    res.status(404).json({ error: 'Mod not found' });
  }
});

// Download: Redirect to Blob downloadUrl (from client-side now, but keeping for compatibility)
app.get('/download/:pathname', async (req, res) => {
  const mods = await loadMods();
  const mod = mods.find(m => m.pathname === req.params.pathname);
  if (mod) {
    res.redirect(mod.downloadUrl);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const { name, description } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }

  try {
    const blob = await put(req.file.originalname, req.file.buffer, {
      access: 'public',
      addRandomSuffix: true // Avoid overwrites
    });

    const mods = await loadMods();
    mods.push({
      name,
      description,
      pathname: blob.pathname, // Use pathname for unique ID
      url: blob.url,
      downloadUrl: blob.downloadUrl
    });
    await saveMods(mods);
    res.json({ message: 'Mod uploaded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/delete/:pathname', async (req, res) => {
  const { pathname } = req.params;
  try {
    const mods = await loadMods();
    const index = mods.findIndex(m => m.pathname === pathname);
    if (index === -1) {
      return res.status(404).json({ error: 'Mod not found' });
    }

    // Delete file from Blob
    await del(mods[index].url); // del accepts url or pathname

    mods.splice(index, 1);
    await saveMods(mods);
    res.json({ message: 'Mod deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});