import { NextResponse } from 'next/server';
import { DATE_RANGE_COOKIE, DATE_RANGE_COOKIE_MAX_AGE } from '@/lib/preferences';

interface DateRangePayload {
  from?: string | null;
  to?: string | null;
}

function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !value) {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  let body: DateRangePayload = {};
  try {
    body = await request.json();
  } catch {
    // ignore malformed body; treat as clear
  }
  const from = isValidDateString(body.from) ? body.from : null;
  const toCandidate = isValidDateString(body.to) ? body.to : null;
  const to = toCandidate ?? from;

  const response = NextResponse.json({ success: true });
  if (from) {
    response.cookies.set({
      name: DATE_RANGE_COOKIE,
      value: `${from}|${to ?? ''}`,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: DATE_RANGE_COOKIE_MAX_AGE,
      path: '/',
    });
  } else {
    response.cookies.set({
      name: DATE_RANGE_COOKIE,
      value: '',
      path: '/',
      maxAge: 0,
    });
  }
  return response;
}
