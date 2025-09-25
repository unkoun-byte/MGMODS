// public/script.js (upgraded with improved fetch error handling, debug logs, and 'no mods' message)
document.addEventListener('DOMContentLoaded', () => {
  const modList = document.getElementById('mod-list');
  const searchInput = document.getElementById('search');
  let debounceTimer = null;

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('mgmods_theme', t);
  }
  const saved = localStorage.getItem('mgmods_theme') || 'dark';
  applyTheme(saved);
  if (themeToggle) themeToggle.addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

  function renderMods(mods) {
    modList.innerHTML = '';
    if (!mods || mods.length === 0) {
      modList.innerHTML = '<p>No mods available</p>';
      return;
    }
    mods.forEach(mod => {
      const card = document.createElement('div');
      card.classList.add('mod-card');
      card.innerHTML = `
        <h3>${mod.name || mod.filename}</h3>
        <p>${mod.description || ''}</p>
        ${mod.downloadUrl ? `<a href='${mod.downloadUrl}' target='_blank' class='download-btn'>Download</a>` : ''}
      `;
      card.addEventListener('click', () => {
        if (mod.pathname) {
          window.location.href = `/view/${encodeURIComponent(mod.pathname)}`;
        }
      });
      modList.appendChild(card);
    });
  }

  async function fetchMods(q = '') {
    try {
      const catSel = document.getElementById('category-filter');
      const verSel = document.getElementById('version-filter');
      const category = catSel ? catSel.value : 'all';
      const version = verSel ? verSel.value : 'all';
      const url = '/mods?q=' + encodeURIComponent(q) + '&limit=100&category=' + encodeURIComponent(category) + '&version=' + encodeURIComponent(version);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      console.log('Search result:', data);
      renderMods(data.results || []);
    } catch (err) {
      console.error('Error fetching mods:', err);
      modList.innerHTML = '<p>Error loading mods</p>';
    }
  }

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchMods(q), 250);
  });

  const homepageCat = document.getElementById('category-filter');
  const homepageVer = document.getElementById('version-filter');
  if (homepageCat) homepageCat.addEventListener('change', () => fetchMods(searchInput.value));
  if (homepageVer) homepageVer.addEventListener('change', () => fetchMods(searchInput.value));

  // initial load
  fetchMods('');
});
