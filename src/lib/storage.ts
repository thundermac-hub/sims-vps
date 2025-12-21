import { randomBytes } from 'crypto';
import { Client } from 'minio';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var minioClient: Client | undefined;
  // eslint-disable-next-line no-var
  var minioPublicClient: Client | undefined;
  // eslint-disable-next-line no-var
  var minioBucketReady: boolean | undefined;
}

function getMinioClient(kind: 'internal' | 'public' = 'internal'): Client {
  if (kind === 'public') {
    if (!global.minioPublicClient) {
      global.minioPublicClient = new Client({
        endPoint: env.minioPublicEndpoint,
        port: env.minioPublicPort,
        useSSL: env.minioPublicUseSSL,
        accessKey: env.minioAccessKey,
        secretKey: env.minioSecretKey,
        region: env.minioRegion ?? undefined,
      });
    }
    return global.minioPublicClient;
  }
  if (!global.minioClient) {
    global.minioClient = new Client({
      endPoint: env.minioEndpoint,
      port: env.minioPort,
      useSSL: env.minioUseSSL,
      accessKey: env.minioAccessKey,
      secretKey: env.minioSecretKey,
      region: env.minioRegion ?? undefined,
    });
  }
  return global.minioClient;
}

async function ensureBucketExists(client = getMinioClient()) {
  if (global.minioBucketReady) {
    return;
  }
  try {
    const exists = await client.bucketExists(env.minioBucket);
    if (!exists) {
      await client.makeBucket(env.minioBucket, env.minioRegion ?? undefined);
    }
    global.minioBucketReady = true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    err.message = `MinIO bucket check failed: ${err.message}`;
    throw err;
  }
}

export async function uploadAttachment(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = (() => {
    const name = file.name ?? '';
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot).toLowerCase() : '';
  })();
  const key = `attachments/${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString('hex')}${ext}`;

  const client = getMinioClient();
  await ensureBucketExists(client);

  await client.putObject(env.minioBucket, key, buffer, buffer.length, {
    'Content-Type': file.type || 'application/octet-stream',
  });

  return key;
}

export async function getAttachmentUrl(key: string): Promise<string> {
  // Use the public endpoint (if provided) so presigned URLs are reachable by the browser.
  await ensureBucketExists(getMinioClient());
  const url = await getMinioClient('public').presignedGetObject(env.minioBucket, key, env.minioSignedUrlTtl);
  if (!url) {
    throw new Error('Failed to generate signed URL');
  }
  return url;
}
