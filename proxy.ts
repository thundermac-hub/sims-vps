import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, USER_COOKIE, isSessionValid } from '@/lib/session';

const PROTECTED_PATHS = ['/dashboard', '/tickets', '/profile', '/api/admin'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/login')) {
    if (isSessionValid(request.cookies.get(SESSION_COOKIE)?.value)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      const response = NextResponse.redirect(url);
      response.headers.set('Cache-Control', 'no-store, must-revalidate');
      return response;
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/logout')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    const response = NextResponse.redirect(url);
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(USER_COOKIE);
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    return response;
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (isSessionValid(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const redirectTarget = pathname !== '/login' ? `${pathname}${search}` : null;
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  const searchParams = new URLSearchParams(loginUrl.search);
  if (redirectTarget) {
    searchParams.set('redirect', redirectTarget);
  } else {
    searchParams.delete('redirect');
  }
  loginUrl.search = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = NextResponse.redirect(loginUrl);
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/tickets/:path*', '/profile/:path*', '/api/admin/:path*', '/login', '/logout'],
};
