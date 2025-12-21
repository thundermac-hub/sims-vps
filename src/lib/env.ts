const REQUIRED_ENV = [
  'ADMIN_USER',
  'ADMIN_PASS',
  'WHATSAPP_PHONE',
  'MYSQL_HOST',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
];

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const missing = REQUIRED_ENV.filter((key) => {
  const value = process.env[key];
  return value === undefined || value === null || value === '';
});

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

function toInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalised = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalised)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalised)) {
    return false;
  }
  return fallback;
}

function cleanPhone(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

const minioEndpoint = readEnv('MINIO_ENDPOINT');
const minioPort = toInt(process.env.MINIO_PORT ?? '9000', 9000);
const minioUseSSL = toBool(process.env.MINIO_USE_SSL, false);
const minioPublicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT ?? minioEndpoint;
const minioPublicPort = toInt(process.env.MINIO_PUBLIC_PORT ?? String(minioPort), minioPort);
const minioPublicUseSSL = toBool(process.env.MINIO_PUBLIC_USE_SSL, minioUseSSL);
const minioSignedUrlTtl = toInt(process.env.MINIO_SIGNED_URL_TTL ?? '300', 300);

export const env = {
  adminUser: readEnv('ADMIN_USER'),
  adminPass: readEnv('ADMIN_PASS'),
  whatsappPhone: cleanPhone(readEnv('WHATSAPP_PHONE')),
  maxUploadBytes: toInt(process.env.MAX_UPLOAD_BYTES ?? String(5 * 1024 * 1024), 5 * 1024 * 1024),
  allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES ?? 'image/jpeg,image/png,image/heic,application/pdf')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
  mysqlHost: readEnv('MYSQL_HOST'),
  mysqlPort: toInt(process.env.MYSQL_PORT ?? '3306', 3306),
  mysqlUser: readEnv('MYSQL_USER'),
  mysqlPassword: readEnv('MYSQL_PASSWORD'),
  mysqlDatabase: readEnv('MYSQL_DATABASE'),
  minioEndpoint,
  minioPort,
  minioUseSSL,
  minioPublicEndpoint,
  minioPublicPort,
  minioPublicUseSSL,
  minioSignedUrlTtl,
  minioAccessKey: readEnv('MINIO_ACCESS_KEY'),
  minioSecretKey: readEnv('MINIO_SECRET_KEY'),
  minioBucket: readEnv('MINIO_BUCKET'),
  minioRegion: process.env.MINIO_REGION ?? null,
  clickupToken: process.env.CLICKUP_TOKEN ?? null,
  clickupListId: process.env.CLICKUP_LIST_ID ?? null,
  clickupTeamId: process.env.CLICKUP_TEAM_ID ?? null,
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Kuala_Lumpur',
  franchiseApiEmail: process.env.CLOUD_API_EMAIL ?? null,
  franchiseApiPassword: process.env.CLOUD_API_PASSWORD ?? null,
};
