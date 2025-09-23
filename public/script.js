document.addEventListener('DOMContentLoaded', () => {
  const modList = document.getElementById('mod-list');
  const searchInput = document.getElementById('search');

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
          `;
          card.addEventListener('click', () => {
            window.location.href = `/view/${encodeURIComponent(mod.pathname)}`; // Use pathname
          });
          modList.appendChild(card);
        });
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