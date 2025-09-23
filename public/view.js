document.addEventListener('DOMContentLoaded', () => {
  const modDetails = document.getElementById('mod-details');
  const pathname = decodeURIComponent(window.location.pathname.split('/').pop()); // Decode pathname

  if (!pathname) {
    modDetails.innerHTML = '<h2>Mod Not Found</h2>';
    return;
  }

  fetch(`/mod/${encodeURIComponent(pathname)}`) // Encode for fetch
    .then(response => {
      if (!response.ok) throw new Error('Mod not found');
      return response.json();
    })
    .then(mod => {
      modDetails.innerHTML = `
        <div class="mod-card">
          <h2>${mod.name}</h2>
          <p>${mod.description}</p>
          <a href="${mod.downloadUrl}" download class="download-btn">Download</a>
        </div>
      `;
    })
    .catch(error => {
      console.error('Error:', error);
      modDetails.innerHTML = '<h2>Mod Not Found</h2>';
    });
});