# SIMS Merchant Support (Local)

SIMS is a Next.js 16 (App Router, TypeScript) app for merchant support workflows. It provides a public support form, internal ticket management, analytics dashboards, CSAT surveys, and user management. Data is stored in MySQL, and attachments are stored in MinIO with signed download URLs.

Key modules:
- `/supportform` - public form that stores requests in MySQL and redirects to WhatsApp.
- `/tickets` - ticket management with filtering, CSV export, ClickUp actions, and auto-refresh.
- `/dashboard` - real-time analytics overview (auto-refreshing).
- `/csat` - CSAT analytics dashboard.
- `/csat/[token]` - public CSAT survey with expiring links.
- `/users` & `/profile` - user management and password change flows.

## Quick Start (Local Development)

1. Install dependencies:
   ```
   npm install
   ```
2. Create `.env.local` (see `docs/env.md` for the full list).
3. Start MySQL and MinIO locally (see examples below).
4. Initialize the database with `schema.sql`.
5. Run the dev server:
   ```
   npm run dev
   ```
   - Form: `http://localhost:3000/supportform`
   - Login: `http://localhost:3000/login`
   - Dashboard: `http://localhost:3000/dashboard`

## Dockerfile (Local)

Build and run the app container:
```
docker build -t sims-app .
docker run --rm -p 3000:3000 --env-file .env.local sims-app
```

The app still needs MySQL and MinIO running locally. Example Docker commands:
```
docker run --rm -d --name sims-mysql \
  -e MYSQL_DATABASE=sims_support \
  -e MYSQL_USER=sims \
  -e MYSQL_PASSWORD=sims-password \
  -e MYSQL_ROOT_PASSWORD=root-password \
  -p 3306:3306 \
  mysql:8.0

docker run --rm -d --name sims-minio \
  -e MINIO_ROOT_USER=minio \
  -e MINIO_ROOT_PASSWORD=minio-secret \
  -p 9000:9000 -p 9001:9001 \
  quay.io/minio/minio:latest server /data --console-address ":9001"
```

After MySQL is running, load `schema.sql` and create the MinIO bucket referenced by `MINIO_BUCKET`.

## Environment Variables

Copy the template in `docs/env.md` into `.env.local` and adjust:
- `ADMIN_USER`, `ADMIN_PASS`, `WHATSAPP_PHONE`
- `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- Optional: `APP_TIMEZONE`, `MAX_UPLOAD_BYTES`, `ALLOWED_MIME_TYPES`, ClickUp and franchise API credentials.

## Notes

- Credentials must stay server-side. Do not expose them to the browser.
- Attachments are private by default; signed URLs are generated on demand.
