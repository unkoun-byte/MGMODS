MGMODS — Lightweight mod hosting UI

Quick start

1. Copy `.env.example` to `.env` and fill values (especially `BLOB_READ_WRITE_TOKEN`, `ADMIN_USER`, `ADMIN_PASS`, `JWT_SECRET`).

2. Install dependencies:

```bash
npm install
```

3. Run locally (example):

```bash
BLOB_READ_WRITE_TOKEN=your_token_here PORT=3000 node server.js
```

4. Open http://localhost:3000

Admin: http://localhost:3000/admin

Notes
- The server persists metadata to `METADATA_PATH` in the blob store (default `metadata/mods.json`).
- When deploying (e.g., Vercel), set the same environment variables in your deployment settings.
- The admin panel uses simple username/password stored in environment variables. For production, use secure secrets and stronger auth.

If you want, I can add CI checks, retries, and PWA features next.
