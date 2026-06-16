# Render Deployment

## Files Added

- `render.yaml`
- `.gitignore`

## Before You Deploy

1. Push this project to a GitHub repository.
2. Make sure the repo root contains:
   - `package.json`
   - `index.js`
   - `render.yaml`

## Deploy Steps

1. Log in to Render.
2. Click `New` -> `Blueprint`.
3. Connect your GitHub account.
4. Select this repository.
5. Confirm the Blueprint settings from `render.yaml`.
6. When prompted for `JWT_SECRET`, enter a strong secret value.
7. Deploy the Blueprint.

## Important Notes

- This setup uses a persistent disk mounted at `/var/data`.
- SQLite database path on Render is `/var/data/cobbler.db`.
- Backups are stored in `/var/data/backup`.
- The app health check path is `/health`.
- Render persistent disks require a paid web service plan, so this setup uses `starter`.

## After Deploy

1. Open the Render service URL.
2. Log in with the default admin account.
3. Change credentials after first login if needed.
4. Add your custom domain in Render if required.
