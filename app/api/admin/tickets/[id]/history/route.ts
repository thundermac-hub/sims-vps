import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isSessionValid, SESSION_COOKIE } from '@/lib/session';
import { getSupportRequestHistory } from '@/lib/requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  if (!isSessionValid(cookieStore.get(SESSION_COOKIE)?.value ?? null)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await context.params;
  const id = Number(resolvedParams.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
  }

  try {
    const history = await getSupportRequestHistory(id);
    return NextResponse.json({ history });
  } catch (error) {
    console.error('Failed to fetch ticket history', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
