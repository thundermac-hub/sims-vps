import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { startFranchiseImport } from '@/lib/franchise-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = env.franchiseImportCronSecret;
  const provided = request.headers.get('x-cron-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const job = await startFranchiseImport('cron', 'cron');
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start import.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
