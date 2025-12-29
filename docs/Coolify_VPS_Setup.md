# Coolify VPS Setup and Deployment

This guide shows how to install Coolify on a VPS and deploy the SIMS app with MySQL, MinIO, and phpMyAdmin.

## Prerequisites
- A fresh VPS (Ubuntu 22.04 or similar) with SSH access
- A domain name (optional but recommended for HTTPS)
- Access to this repo (for the app image build)

## 1) Install Coolify on the VPS
1. Open firewall ports `22`, `80`, and `443`.
2. SSH into the VPS and run the official installer:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

3. Open the Coolify URL shown in the installer output and complete the initial setup.

## 2) Create a Project and Environment
1. In Coolify, create a new Project, e.g. `sims`.
2. Add an Environment, e.g. `production`.

## 3) Provision Required Services
Create the following services in the same environment so they can talk over the internal network.

### MySQL (service)
- Image: `mysql:8.0`
- Internal port: `3306` (do not expose publicly)
- Environment variables:
  - `MYSQL_ROOT_PASSWORD` (choose a strong value)
  - `MYSQL_DATABASE=sims_support`
  - `MYSQL_USER=sims`
  - `MYSQL_PASSWORD=<strong password>`
- Volume: mount `/var/lib/mysql` to a persistent volume
- Service name: `mysql` (used by the app as `MYSQL_HOST`)

### MinIO (service)
- Image: `quay.io/minio/minio:latest`
- Command: `server /data --console-address ":9001"`
- Internal ports: `9000` (API), `9001` (console)
- Environment variables:
  - `MINIO_ROOT_USER=minio`
  - `MINIO_ROOT_PASSWORD=<strong password>`
- Volume: mount `/data` to a persistent volume
- Service name: `minio` (used by the app as `MINIO_ENDPOINT`)
- Optional: expose the console at a domain like `minio.example.com`

### phpMyAdmin (service)
- Image: `phpmyadmin/phpmyadmin:latest`
- Internal port: `80`
- Environment variables:
  - `PMA_HOST=mysql`
  - `PMA_PORT=3306`
- Expose to a domain like `db.example.com` and protect it (IP allowlist or basic auth)

## 4) Deploy the App
1. Create a new Application from this repo in the same environment.
2. Build settings:
   - Build pack: Dockerfile
   - Dockerfile path: `Dockerfile`
   - Exposed port: `3000`
3. Set the environment variables in Coolify (example below). Use the service names from above.

```env
ADMIN_USER=admin
ADMIN_PASS=change-me
WHATSAPP_PHONE=60136062465

MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=sims
MYSQL_PASSWORD=<mysql-user-password>
MYSQL_DATABASE=sims_support

MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=<minio-root-password>
MINIO_BUCKET=attachments

APP_TIMEZONE=Asia/Kuala_Lumpur
MAX_UPLOAD_BYTES=5242880
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/heic,image/heif,application/pdf
```

Use `docs/env.md` as the full reference for optional values (ClickUp, franchise API, cron secret).

## 5) Initialize the Database and Bucket
### Load the schema
- Use phpMyAdmin or a MySQL console in Coolify to import `schema.sql` into `sims_support`.

### Create the MinIO bucket
- Open the MinIO console and create a bucket matching `MINIO_BUCKET` (default `attachments`).

## 6) Verify
- App: `https://app.example.com/supportform`
- Login: `https://app.example.com/login`
- Tickets: `https://app.example.com/tickets`
- Upload an attachment and confirm it appears in MinIO.

## Notes and Maintenance
- Keep MySQL and MinIO internal-only; only expose the app and phpMyAdmin if needed.
- Store secrets in Coolify environment variables and rotate them regularly.
- Configure backups for the MySQL and MinIO volumes.
