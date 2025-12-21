import { cookies as getCookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, USER_COOKIE } from '@/lib/session';

export default async function LogoutPage() {
  const store = await getCookies();
  store.delete(SESSION_COOKIE);
  store.delete(USER_COOKIE);
  redirect('/login');
}
