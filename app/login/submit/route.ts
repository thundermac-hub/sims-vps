'use server';

import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getUserAuthRecord } from '@/lib/users';
import { verifyPassword } from '@/lib/password';
import { SESSION_COOKIE, USER_COOKIE, expectedSessionToken } from '@/lib/session';

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 12,
};

function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim() === 'https';
  }
  return request.nextUrl.protocol === 'https:';
}

function resolveRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const host = forwardedHost ?? request.headers.get('host') ?? request.nextUrl.host;
  const protocol = forwardedProto ? `${forwardedProto}:` : request.nextUrl.protocol;
  return `${protocol}//${host}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const username = (formData.get('username') ?? '').toString().trim();
    const password = (formData.get('password') ?? '').toString();
    const redirectValue = (formData.get('redirect') ?? '/dashboard').toString();
    const destination = redirectValue.startsWith('/') ? redirectValue : '/dashboard';

    let record: Awaited<ReturnType<typeof getUserAuthRecord>> | null = null;
    try {
      record = await getUserAuthRecord(username);
    } catch (error) {
      console.error('Failed to fetch user auth record', error);
    }

    let authenticatedId: string | null = null;
    if (record && verifyPassword(password, record.passwordHash)) {
      authenticatedId = String(record.id);
    } else if (username === env.adminUser && password === env.adminPass) {
      authenticatedId = record ? String(record.id) : 'env-admin';
    }

    if (!authenticatedId) {
      const loginUrl = new URL('/login', resolveRequestOrigin(request));
      loginUrl.searchParams.set('error', '1');
      loginUrl.searchParams.set('redirect', destination);
      return NextResponse.redirect(loginUrl);
    }

    const destinationUrl = new URL(destination, resolveRequestOrigin(request));
    destinationUrl.search = '';
    const response = NextResponse.redirect(destinationUrl);
    const cookieOptions = { ...BASE_COOKIE_OPTIONS, secure: isSecureRequest(request) };
    response.cookies.set(SESSION_COOKIE, expectedSessionToken(), cookieOptions);
    response.cookies.set(USER_COOKIE, authenticatedId, cookieOptions);
    return response;
  } catch (error) {
    console.error('Login submission failed', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}
