// public/script.js (upgraded with improved fetch error handling, debug logs, and 'no mods' message)
document.addEventListener('DOMContentLoaded', () => {
  const modList = document.getElementById('mod-list');
  const searchInput = document.getElementById('search');

  function fetchMods() {
    fetch('/mods')
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok ' + response.statusText);
        return response.json();
      })
      .then(mods => {
        console.log('Mods received:', mods); // Debug log
        modList.innerHTML = '';
        if (mods.length === 0) {
          modList.innerHTML = '<p>No mods available</p>';
        } else {
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
      })
      .catch(error => console.error('Error fetching mods:', error));
  }

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const cards = modList.querySelectorAll('.mod-card');
    cards.forEach(card => {
      const name = card.querySelector('h3').textContent.toLowerCase();
      const desc = card.querySelector('p').textContent.toLowerCase();
      card.style.display = (name.includes(query) || desc.includes(query)) ? 'block' : 'none';
    });
  });

  fetchMods();
});
