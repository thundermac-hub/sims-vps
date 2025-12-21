## Repository Guidelines

### Project Structure & Module Organisation
- `app/` – Next.js App Router pages and API routes (`supportform`, `(protected)/dashboard`, `(protected)/tickets`, `(protected)/profile`, `(protected)/users`, `login`, `logout`, `api/requests`, `api/admin/export`).
- `src/lib/` – Shared TypeScript helpers (`env`, `db`, `requests`, `storage`).
- `public/` – Static assets (e.g., `/assets`).
- Root – `schema.sql`, `README.md`, `Dockerfile`, config docs.
- `uploads/` – Legacy folder (no longer used; MinIO handles uploads).

### Build, Test, and Development Commands
- Install dependencies: `npm install`
- Local dev: `npm run dev`
  - Form: `http://localhost:3000/supportform`
  - Login: `http://localhost:3000/login`
  - Tickets: `http://localhost:3000/tickets`
- Production build: `npm run build`

### Runtime & Infrastructure
- Local runtime (Dockerfile or `npm run dev`)
- Database: MySQL (apply `schema.sql`)
- Storage: MinIO bucket defined by `MINIO_BUCKET`
- Auth: Cookie-based session handled by middleware (credentials from `ADMIN_USER` / `ADMIN_PASS`)

### Environment Variables (required)
- `ADMIN_USER`, `ADMIN_PASS`, `WHATSAPP_PHONE`
- `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- Optional overrides: `MYSQL_PORT`, `MINIO_PORT`, `MINIO_REGION`, `MINIO_USE_SSL`, `MAX_UPLOAD_BYTES`, `ALLOWED_MIME_TYPES`, `APP_TIMEZONE`, `CLICKUP_TOKEN`, `CLICKUP_LIST_ID`, `CLICKUP_TEAM_ID`

### Department-Aware Behaviour
- Each authenticated user has a department and role. Merchants Success + Super Admins can access the dashboard/tickets; other departments are redirected.
- Navbar subtitle shows `{Department} Portal` (or “Super Admin Portal”) based on the signed-in user.
- `/users` is the shared user-management surface. Super Admins can see all users and pick any department/role; department Admins only see/manage their own department and are limited to assigning `Admin`/`User` roles.
- Tickets auto-refresh every 15s (via `TicketsAutoRefresh`); the dashboard now does the same with `DashboardAutoRefresh`.

### Coding Style & Conventions
- TypeScript + ESLint defaults; favour async/await and the MySQL/MinIO helpers in `src/lib`.
- Server-only logic should stay in server files or helper modules (service credentials must remain server-side).
- CSS Modules colocated with routes.

### Testing Guidelines
- No automated test suite. Validate manually:
  1. Submit support request → confirm MySQL row + WhatsApp redirect.
  2. Tickets page → login via `/login`, filter, update status, download CSV export.
  3. Verify attachment upload/download via MinIO signed URLs.

### PR/Commit Expectations
- Commit messages: imperative, succinct; add context in body when needed.
- PRs: include summary, database/storage migration steps (if schema changes), manual test notes, and screenshots/GIFs for UI updates.

### Security & Configuration Tips
- Keep database and MinIO credentials server-side only.
- Limit MinIO bucket MIME types/size using app envs (`ALLOWED_MIME_TYPES`, `MAX_UPLOAD_BYTES`).
- Use HTTPS for production; rotate `ADMIN_PASS` regularly and clear sessions via `/logout` when needed.
