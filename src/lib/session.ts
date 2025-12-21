import { env } from './env';

export const SESSION_COOKIE = 'ms_auth';
export const USER_COOKIE = 'ms_user';

export function expectedSessionToken(): string {
  return `${env.adminUser}:${env.adminPass}`;
}

export function isSessionValid(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }
  return token === expectedSessionToken();
}
