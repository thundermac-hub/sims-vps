import { cookies } from 'next/headers';
import { USER_COOKIE } from './session';
import { env } from './env';
import { getUserByEmail, getUserById, isPrivilegedRole } from './users';

export interface AuthenticatedUser {
  id: number | null;
  email: string;
  name: string;
  role: string | null;
  department: string | null;
  isSuperAdmin: boolean;
  canManageUsers: boolean;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const cookieStore = await cookies();
  const rawIdentifier = cookieStore.get(USER_COOKIE)?.value ?? null;
  let userRecord: Awaited<ReturnType<typeof getUserById>> | null = null;

  if (rawIdentifier && /^\d+$/.test(rawIdentifier)) {
    userRecord = await getUserById(Number(rawIdentifier));
  } else if (rawIdentifier && rawIdentifier !== 'env-admin') {
    userRecord = await getUserByEmail(rawIdentifier);
  }

  const email = userRecord?.email ?? (rawIdentifier && rawIdentifier !== 'env-admin' ? rawIdentifier : env.adminUser);
  const name = userRecord?.name?.trim()?.length ? (userRecord.name as string).trim() : email;
  const role = userRecord?.role ?? (rawIdentifier === 'env-admin' ? 'Super Admin' : null);
  const department = userRecord?.department ?? null;
  const isSuperAdmin = role?.trim().toLowerCase() === 'super admin' || rawIdentifier === 'env-admin';
  const canManageUsers = isSuperAdmin || isPrivilegedRole(role);

  return {
    id: userRecord?.id ?? null,
    email,
    name,
    role,
    department,
    isSuperAdmin,
    canManageUsers,
  };
}
