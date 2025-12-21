'use server';

import { revalidatePath } from 'next/cache';
import { cookies as getCookies } from 'next/headers';
import { USER_COOKIE } from '@/lib/session';
import { verifyPassword } from '@/lib/password';
import { getUserAuthRecord, updateUser } from '@/lib/users';
import type { PasswordFormState } from './ChangePasswordForm';
import { loadProfileUser } from './profile-utils';

export async function changePasswordAction(_: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const cookieStore = await getCookies();
  const rawIdentifier = cookieStore.get(USER_COOKIE)?.value;
  const userRecord = await loadProfileUser(rawIdentifier);

  if (!userRecord?.id || !userRecord.email) {
    return {
      status: 'error',
      message: 'Password changes are only available for managed user accounts.',
    };
  }

  const currentPassword = (formData.get('current_password') ?? '').toString();
  const newPassword = (formData.get('new_password') ?? '').toString();
  const confirmPassword = (formData.get('confirm_password') ?? '').toString();

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { status: 'error', message: 'All password fields are required.' };
  }
  if (newPassword !== confirmPassword) {
    return { status: 'error', message: 'New passwords do not match.' };
  }
  if (newPassword.length < 8) {
    return { status: 'error', message: 'New password must be at least 8 characters long.' };
  }
  if (currentPassword === newPassword) {
    return { status: 'error', message: 'New password must be different from the current password.' };
  }

  const authRecord = await getUserAuthRecord(userRecord.email);
  if (!authRecord || !verifyPassword(currentPassword, authRecord.passwordHash)) {
    return { status: 'error', message: 'Current password is incorrect.' };
  }

  try {
    await updateUser(userRecord.id, { password: newPassword });
  } catch (error) {
    console.error('Failed to update password', error);
    return { status: 'error', message: 'Failed to update password. Please try again.' };
  }

  await revalidatePath('/profile');
  return { status: 'success', message: 'Password updated successfully.' };
}
