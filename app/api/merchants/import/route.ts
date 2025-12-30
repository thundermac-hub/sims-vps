import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessMerchantsPages } from '@/lib/branding';
import { startFranchiseImport } from '@/lib/franchise-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const authUser = await getAuthenticatedUser();
  if (!canAccessMerchantsPages(authUser.department, authUser.isSuperAdmin)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const job = await startFranchiseImport('manual', authUser.email);
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start import.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
