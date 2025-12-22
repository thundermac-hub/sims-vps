import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages } from '@/lib/branding';
import { getFranchiseImportJob } from '@/lib/franchise-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

export async function GET(_request: Request, context: { params: Params }) {
  const authUser = await getAuthenticatedUser();
  if (!canAccessSupportPages(authUser.department, authUser.isSuperAdmin)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = Number.parseInt(context.params.id, 10);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  try {
    const job = await getFranchiseImportJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch import status.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
