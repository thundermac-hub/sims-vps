import { getUserByEmail, getUserById, type ManagedUser } from '@/lib/users';

export async function loadProfileUser(rawIdentifier: string | undefined | null): Promise<ManagedUser | null> {
  if (rawIdentifier && /^\d+$/.test(rawIdentifier)) {
    return getUserById(Number(rawIdentifier));
  }
  if (rawIdentifier && rawIdentifier !== 'env-admin') {
    return getUserByEmail(rawIdentifier);
  }
  return null;
}
