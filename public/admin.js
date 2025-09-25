document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const adminContent = document.getElementById('admin-content');
  const uploadForm = document.getElementById('upload-form');
  const modList = document.getElementById('mod-list');
  const loginBtn = document.getElementById('login-btn');

  loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
      const r = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      if (!r.ok) throw new Error('Invalid credentials');
      loginForm.style.display = 'none';
      adminContent.style.display = 'block';
      fetchMods();
    } catch (err) {
      alert('Login failed');
    }
  });

  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn.addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' });
    loginForm.style.display = 'block';
    adminContent.style.display = 'none';
  });

  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(uploadForm);
    const xhr = new XMLHttpRequest();
    const uploadBtn = document.getElementById('upload-btn');
    const progressBar = document.getElementById('upload-progress');
    const percentText = document.getElementById('upload-percent');

    uploadBtn.disabled = true;
    uploadBtn.classList.add('loading');

    xhr.open('POST', '/upload');
    xhr.upload.onprogress = function (event) {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        progressBar.style.width = percent + '%';
        percentText.textContent = percent + '%';
      }
    };
    xhr.onload = function () {
      uploadBtn.disabled = false;
      uploadBtn.classList.remove('loading');
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText || '{}');
        if (data.error) {
          alert(data.error);
        } else {
          alert(data.message || 'Uploaded');
          uploadForm.reset();
          progressBar.style.width = '0%';
          percentText.textContent = '0%';
          fetchMods();
        }
      } else {
        console.error('Upload failed', xhr.status, xhr.responseText);
        alert('Upload failed: ' + xhr.status);
      }
    };
    xhr.onerror = function () {
      uploadBtn.disabled = false;
      uploadBtn.classList.remove('loading');
      alert('Network error during upload');
    };
    xhr.send(formData);
  });

  // default upload category from current filter
  const categorySelect = document.getElementById('category-select');
  const categoryFilter = document.getElementById('category-filter');
  if (categoryFilter && categorySelect) {
    categoryFilter.addEventListener('change', () => {
      categorySelect.value = categoryFilter.value === 'all' ? 'mod' : categoryFilter.value;
    });
    // initialize
    categorySelect.value = categoryFilter.value === 'all' ? 'mod' : categoryFilter.value;
  }

  function fetchMods() {
    fetch('/mods')
    function matchesFilters(mod) {
      const cat = document.getElementById('category-filter').value;
      const ver = document.getElementById('version-filter').value;
      if (cat !== 'all' && (mod.category || 'mod') !== cat) return false;
      if (ver !== 'all') {
        const vs = mod.versions || [];
        if (!vs.includes(ver)) return false;
      }
      return true;
    }

    function fetchMods() {
      fetch('/mods')
        .then(response => response.json())
        .then(data => {
          const mods = data.results || [];
          modList.innerHTML = '';
          mods.filter(matchesFilters).forEach(mod => {
            const card = document.createElement('div');
            card.classList.add('mod-card');
            card.innerHTML = `
              <h3>${mod.name}</h3>
              <p>${mod.description}</p>
              <p><strong>Category:</strong> ${mod.category || 'mod'}</p>
              <p><strong>Versions:</strong> ${(mod.versions || []).join(', ')}</p>
              <a href="${mod.downloadUrl}" download class="download-btn">Download</a>
              <button class="delete-btn" data-pathname="${mod.pathname}">Delete</button>
            `;
            card.querySelector('.delete-btn').addEventListener('click', (e) => {
              const pathname = e.target.dataset.pathname;
              if (confirm(`Are you sure you want to delete ${mod.name}?`)) {
                fetch(`/delete/${encodeURIComponent(pathname)}`, { method: 'DELETE' })
                  .then(response => response.json())
                  .then(data => {
                    if (data.error) {
                      alert(data.error);
                    } else {
                      alert(data.message);
                      fetchMods();
                    }
                  })
                  .catch(error => {
                    console.error('Error deleting mod:', error);
                    alert('Failed to delete mod');
                  });
              }
            });
            modList.appendChild(card);
          });
        })
        .catch(error => console.error('Error fetching mods:', error));
    }

    // initial load
    fetchMods();

    // Filters and controls
    document.getElementById('version-filter').addEventListener('change', fetchMods);
    document.getElementById('category-filter').addEventListener('change', fetchMods);
    document.getElementById('show-all-btn').addEventListener('click', () => {
      document.getElementById('version-filter').value = 'all';
      document.getElementById('category-filter').value = 'all';
      fetchMods();
    });
  }
});