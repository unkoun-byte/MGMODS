document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const adminContent = document.getElementById('admin-content');
  const uploadForm = document.getElementById('upload-form');
  const modList = document.getElementById('mod-list');
  const loginBtn = document.getElementById('login-btn');

  loginBtn.addEventListener('click', () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    if (username === 'AMAANE' && password === 'Amaane3grok') {
      loginForm.style.display = 'none';
      adminContent.style.display = 'block';
      fetchMods();
    } else {
      alert('Invalid credentials');
    }
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

  function fetchMods() {
    fetch('/mods')
      .then(response => response.json())
      .then(mods => {
        modList.innerHTML = '';
        mods.forEach(mod => {
          const card = document.createElement('div');
          card.classList.add('mod-card');
          card.innerHTML = `
            <h3>${mod.name}</h3>
            <p>${mod.description}</p>
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
});