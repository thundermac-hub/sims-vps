'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canManageSupportSettings } from '@/lib/branding';
import { getSupportFormSettings, updateSupportFormSettings } from '@/lib/support-settings';
import type { IssueCategoryConfig } from '@/lib/support-settings';
import { parseCategoryMatrixInput } from './category-matrix';

export type SaveSettingsResult =
  | { status: 'success'; message: string; settings: Awaited<ReturnType<typeof getSupportFormSettings>> }
  | { status: 'error'; message: string; settings: Awaited<ReturnType<typeof getSupportFormSettings>> };

export async function loadSupportSettings(): Promise<Awaited<ReturnType<typeof getSupportFormSettings>>> {
  return getSupportFormSettings();
}

export async function saveSettingsAction(_: unknown, formData: FormData): Promise<SaveSettingsResult> {
  const authUser = await getAuthenticatedUser();
  if (!canManageSupportSettings(authUser.department, authUser.role, authUser.isSuperAdmin)) {
    return {
      status: 'error',
      message: 'You do not have permission to update support settings.',
      settings: await loadSupportSettings(),
    };
  }

  try {
    const contactPhone = (formData.get('contactPhone') ?? '').toString().trim() || null;
    const contactEmail = (formData.get('contactEmail') ?? '').toString().trim() || null;
    const matrixRaw = (formData.get('categoryMatrix') ?? '').toString();
    const categoryOptions: IssueCategoryConfig[] = parseCategoryMatrixInput(matrixRaw);

    if (categoryOptions.length === 0) {
      return {
        status: 'error',
        message: 'Add at least one category / subcategory entry.',
        settings: await loadSupportSettings(),
      };
    }

    await updateSupportFormSettings(
      {
        contactPhone,
        contactEmail,
        categoryOptions,
      },
      authUser.email,
    );

    revalidatePath('/supportform');
    revalidatePath('/support-settings');

    return {
      status: 'success',
      message: 'Support form settings saved.',
      settings: await loadSupportSettings(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save settings.';
    return { status: 'error', message, settings: await loadSupportSettings() };
  }
}

export async function ensureCanEditSupportSettings() {
  const authUser = await getAuthenticatedUser();
  if (!canManageSupportSettings(authUser.department, authUser.role, authUser.isSuperAdmin)) {
    redirect('/dashboard');
  }
}
