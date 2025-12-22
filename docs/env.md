# Admin basic auth (protects /dashboard and /api/admin/*)
ADMIN_USER=admin
ADMIN_PASS=changeme

# WhatsApp destination (digits only)
WHATSAPP_PHONE=60136062465

# Attachment controls
MAX_UPLOAD_BYTES=5242880
ALLOWED_MIME_TYPES=image/jpeg,image/png,application/pdf

# MySQL configuration
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=sims
MYSQL_PASSWORD=sims-password
MYSQL_DATABASE=sims_support

# MinIO configuration
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio-secret
MINIO_BUCKET=attachments

# Timezone for formatting dashboard timestamps
APP_TIMEZONE=Asia/Kuala_Lumpur

# ClickUp integration (optional but required if syncing tasks)
CLICKUP_TOKEN=pk_50544870_ES0KQAVWVITUD01UMGDYOZXHMGSXUP9Q
CLICKUP_LIST_ID=900501203144
CLICKUP_TEAM_ID=9005100321

# Franchise lookup API credentials
# Used to fetch franchise/outlet names for tickets based on FID/OID
CLOUD_API_EMAIL=
CLOUD_API_PASSWORD=

# Franchise import cron secret (used by /api/cron/franchise-import)
FRANCHISE_IMPORT_CRON_SECRET=
# Example cron (server host): 15 0 * * * curl -H "x-cron-secret: $FRANCHISE_IMPORT_CRON_SECRET" -X POST http://localhost:3000/api/cron/franchise-import
