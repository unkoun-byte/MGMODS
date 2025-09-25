const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

(async function run() {
  try {
    const res = await fetch('http://localhost:3000/mods');
    if (!res.ok) {
      console.error('Server /mods returned', res.status);
      process.exit(2);
    }
    const body = await res.json();
    if (!body || typeof body !== 'object') {
      console.error('Unexpected response shape', body);
      process.exit(3);
    }
    console.log('Smoke OK:', Object.keys(body));
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
