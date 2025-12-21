'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import {
  RequestStatus,
  createClickUpTaskForTicket,
  fetchRequestByIdWithSignedUrl,
  linkExistingClickUpTask,
  normalisePhone,
  refreshClickUpTaskStatus,
  unlinkClickUpTask,
  updateSupportRequestDetails,
  storeFranchiseOutletResolution,
  hideSupportRequest,
  recordCsatWhatsappSent,
} from '@/lib/requests';
import { fetchFranchiseOutlet } from '@/lib/franchise';
import { USER_COOKIE } from '@/lib/session';
import { getUserByEmail, isPrivilegedRole } from '@/lib/users';
import type { ClickUpActionResult } from './types';
import { getAuthenticatedUser } from '@/lib/auth-user';
import {
  DATE_RANGE_COOKIE,
  DATE_RANGE_COOKIE_MAX_AGE,
  TICKETS_VIEW_COOKIE,
  TICKETS_VIEW_COOKIE_MAX_AGE,
} from '@/lib/preferences';
import { CLICKUP_ENABLED, PER_PAGE_OPTIONS, STATUS_OPTIONS } from './constants';
import { cleanId, isMerchantSuccessUser, normaliseClickUpLinkInput } from './utils';
import { parseViewState } from './view-state';

async function resolveUpdatedByUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const rawUpdatedBy = cookieStore.get(USER_COOKIE)?.value ?? null;
  if (!rawUpdatedBy) {
    return null;
  }
  if (/^\d+$/.test(rawUpdatedBy)) {
    return Number(rawUpdatedBy);
  }
  const matchedUser = await getUserByEmail(rawUpdatedBy);
  return matchedUser ? matchedUser.id : null;
}

export async function updateTicketAction(formData: FormData): Promise<{ success: boolean; error?: string }> {
  'use server';
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid ticket ID.' };
  }

  const merchantName = (formData.get('merchant_name') ?? '').toString().trim();
  const outletName = (formData.get('outlet_name') ?? '').toString().trim();
  const phoneNumberRaw = (formData.get('phone_number') ?? '').toString().trim();
  const emailValue = (formData.get('email') ?? '').toString().trim();
  const fid = (formData.get('fid') ?? '').toString().trim();
  const oid = (formData.get('oid') ?? '').toString().trim();
  const issueType = (formData.get('issue_type') ?? '').toString().trim();
  const issueSubcategory1 = (formData.get('issue_subcategory1') ?? '').toString().trim();
  const issueSubcategory2 = (formData.get('issue_subcategory2') ?? '').toString().trim();
  const issueDescription = (formData.get('issue_description') ?? '').toString().trim();
  const ticketDescriptionRaw = (formData.get('ticket_description') ?? '').toString().trim();
  let statusValue = (formData.get('status') ?? '').toString();
  const clickupLinkValue = (formData.get('clickup_link') ?? '').toString().trim();
  const msPicUserIdRaw = (formData.get('ms_pic_user_id') ?? '').toString().trim();
  const franchiseResolvedFromForm = (formData.get('franchise_name_resolved') ?? '').toString().trim() || null;
  const outletResolvedFromForm = (formData.get('outlet_name_resolved') ?? '').toString().trim() || null;

  const errors: string[] = [];
  if (!merchantName) errors.push('Merchant name is required');
  if (!outletName) errors.push('Outlet name is required');
  if (!phoneNumberRaw) errors.push('Phone number is required');
  if (!issueType) errors.push('Issue type is required');
  if (!issueSubcategory1) errors.push('Subcategory 1 is required');
  if (!issueDescription) errors.push('Issue description is required');
  if (fid && !/^\d{1,4}$/.test(fid)) {
    errors.push('FID must be 1-4 digits');
  }
  if (oid && !/^\d{1,2}$/.test(oid)) {
    errors.push('OID must be 1-2 digits');
  }

  const normalisedPhone = normalisePhone(phoneNumberRaw);
  if (!normalisedPhone) {
    errors.push('Phone number must contain digits');
  }

  if (!STATUS_OPTIONS.includes(statusValue as RequestStatus)) {
    errors.push('Status is invalid');
  }
  let msPicUserId: number | null = null;
  if (msPicUserIdRaw) {
    const parsed = Number(msPicUserIdRaw);
    if (!Number.isFinite(parsed)) {
      errors.push('Assigned MS PIC is invalid');
    } else {
      msPicUserId = parsed;
    }
  }

  const email = emailValue !== '' ? emailValue : null;
  const ticketDescription = ticketDescriptionRaw !== '' ? ticketDescriptionRaw : null;
  const clickupLink = clickupLinkValue !== '' ? clickupLinkValue : null;

  if (msPicUserId !== null && statusValue === 'Open') {
    statusValue = 'In Progress';
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join(' • ') };
  }

  const updatedBy = await resolveUpdatedByUserId();

  const fidClean = cleanId(fid);
  const oidClean = cleanId(oid);
  let resolvedFranchise: string | null = null;
  let resolvedOutlet: string | null = null;
  try {
    if (fidClean && oidClean) {
      const lookup = await fetchFranchiseOutlet(fidClean, oidClean);
      const hasResolved = lookup && lookup.found && (lookup.franchiseName || lookup.outletName);
      if (hasResolved) {
        resolvedFranchise = lookup!.franchiseName ?? null;
        resolvedOutlet = lookup!.outletName ?? null;
      } else {
        resolvedFranchise = null;
        resolvedOutlet = null;
      }
    } else {
      resolvedFranchise = franchiseResolvedFromForm;
      resolvedOutlet = outletResolvedFromForm;
    }
  } catch (error) {
    console.warn('Franchise lookup failed during ticket save', error);
  }

  try {
    await updateSupportRequestDetails(
      id,
      {
        merchantName,
        outletName,
        phoneNumber: normalisedPhone,
        email,
        fid,
        oid,
        issueType,
        issueSubcategory1,
        issueSubcategory2: issueSubcategory2 || null,
        issueDescription,
        ticketDescription,
        status: statusValue as RequestStatus,
        clickupLink,
        msPicUserId,
        franchiseResolved: resolvedFranchise,
        outletResolved: resolvedOutlet,
      },
      updatedBy,
    );
  } catch (error) {
    console.error('Failed to update support request', error);
    return { success: false, error: 'Failed to update ticket. Please try again.' };
  }

  try {
    const fidClean = cleanId(fid);
    const oidClean = cleanId(oid);
    if (fidClean && oidClean) {
      const lookup = await fetchFranchiseOutlet(fidClean, oidClean);
      if (lookup && lookup.found && (lookup.franchiseName || lookup.outletName)) {
        await storeFranchiseOutletResolution(id, lookup.franchiseName ?? null, lookup.outletName ?? null);
      } else if (franchiseResolvedFromForm || outletResolvedFromForm) {
        await storeFranchiseOutletResolution(id, franchiseResolvedFromForm, outletResolvedFromForm);
      }
    }
  } catch (error) {
    console.warn('Failed to resolve/store franchise during ticket update', error);
  }

  await revalidatePath('/tickets');
  return { success: true };
}

export async function createClickUpTaskAction(formData: FormData): Promise<ClickUpActionResult> {
  'use server';
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid ticket ID.' };
  }
  if (!CLICKUP_ENABLED) {
    return { success: false, error: 'ClickUp integration is not configured.' };
  }

  const updatedBy = await resolveUpdatedByUserId();
  try {
    const task = await createClickUpTaskForTicket(id, updatedBy);
    if (!task) {
      return { success: false, error: 'Ticket already has a ClickUp task.' };
    }
    await revalidatePath('/tickets');
    return { success: true, clickupLink: task.url, clickupStatus: task.status ?? null };
  } catch (error) {
    console.error('Failed to create ClickUp task', error);
    return { success: false, error: 'Failed to create ClickUp task. Please try again.' };
  }
}

export async function linkClickUpTaskAction(formData: FormData): Promise<ClickUpActionResult> {
  'use server';
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid ticket ID.' };
  }
  const linkValue = (formData.get('clickup_link') ?? '').toString().trim();
  if (!linkValue) {
    return { success: false, error: 'Enter a ClickUp link or task ID.' };
  }
  const normalised = normaliseClickUpLinkInput(linkValue);
  if (!normalised) {
    return { success: false, error: 'Enter a valid ClickUp link or task ID.' };
  }

  const updatedBy = await resolveUpdatedByUserId();
  try {
    await linkExistingClickUpTask(id, normalised.link, normalised.taskId, updatedBy);
  } catch (error) {
    console.error('Failed to link ClickUp task', error);
    return { success: false, error: 'Failed to link ClickUp task. Please try again.' };
  }
  await revalidatePath('/tickets');
  return { success: true, clickupLink: normalised.link, clickupStatus: null };
}

export async function unlinkClickUpTaskAction(formData: FormData): Promise<ClickUpActionResult> {
  'use server';
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid ticket ID.' };
  }
  const updatedBy = await resolveUpdatedByUserId();
  try {
    await unlinkClickUpTask(id, updatedBy);
  } catch (error) {
    console.error('Failed to remove ClickUp link', error);
    return { success: false, error: 'Failed to remove ClickUp link. Please try again.' };
  }
  await revalidatePath('/tickets');
  return { success: true, clickupLink: null, clickupStatus: null };
}

export async function refreshClickUpStatusAction(formData: FormData): Promise<ClickUpActionResult> {
  'use server';
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid ticket ID.' };
  }
  if (!CLICKUP_ENABLED) {
    return { success: false, error: 'ClickUp integration is not configured.' };
  }
  const updatedBy = await resolveUpdatedByUserId();
  try {
    const status = await refreshClickUpTaskStatus(id, updatedBy);
    await revalidatePath('/tickets');
    return { success: true, clickupStatus: status ?? null };
  } catch (error) {
    console.error('Failed to refresh ClickUp status', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to refresh ClickUp status.' };
  }
}

export async function markCsatWhatsappSentAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  'use server';
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid ticket ID.' };
  }
  const updatedBy = await resolveUpdatedByUserId();
  try {
    await recordCsatWhatsappSent(id, updatedBy);
  } catch (error) {
    console.error('Failed to record CSAT WhatsApp send', error);
    return { success: false, error: 'Failed to record WhatsApp send.' };
  }
  await revalidatePath('/tickets');
  return { success: true };
}

export async function attendTicketAction(formData: FormData): Promise<void> {
  'use server';
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return;
  }
  const authUser = await getAuthenticatedUser();
  if (!isMerchantSuccessUser(authUser.department, authUser.isSuperAdmin)) {
    return;
  }
  if (!authUser.id) {
    return;
  }

  const existing = await fetchRequestByIdWithSignedUrl(id);
  if (!existing) {
    return;
  }

  if (existing.ms_pic_user_id === authUser.id) {
    return;
  }

  const updatedBy = await resolveUpdatedByUserId();
  const nextStatus: RequestStatus = existing.status === 'Open' ? 'In Progress' : (existing.status as RequestStatus);

  try {
    await updateSupportRequestDetails(
      id,
      {
        merchantName: existing.merchant_name,
        outletName: existing.outlet_name,
        phoneNumber: existing.phone_number,
        email: existing.email,
        fid: existing.fid,
        oid: existing.oid,
        issueType: existing.issue_type,
        issueSubcategory1: existing.issue_subcategory1,
        issueSubcategory2: existing.issue_subcategory2,
        issueDescription: existing.issue_description,
        ticketDescription: existing.ticket_description,
        status: nextStatus,
        clickupLink: existing.clickup_link,
        msPicUserId: authUser.id,
        franchiseResolved: existing.franchise_name_resolved ?? null,
        outletResolved: existing.outlet_name_resolved ?? null,
      },
      updatedBy,
    );
  } catch (error) {
    console.error('Failed to assign MS PIC via attend', error);
    return;
  }

  await revalidatePath('/tickets');
}

export async function toggleArchiveTicketAction(formData: FormData): Promise<{ success: boolean; error?: string }> {
  'use server';
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid ticket ID.' };
  }
  const mode = (formData.get('mode') ?? 'archive').toString();
  const hideValue = mode === 'unarchive' ? false : true;

  const authUser = await getAuthenticatedUser();
  const canHide = authUser.isSuperAdmin || isPrivilegedRole(authUser.role);
  if (!canHide) {
    return { success: false, error: 'You do not have permission to archive tickets.' };
  }

  const updatedBy = await resolveUpdatedByUserId();
  try {
    await hideSupportRequest(id, updatedBy, hideValue);
  } catch (error) {
    console.error('Failed to update archive state', error);
    return { success: false, error: 'Failed to update ticket state. Please try again.' };
  }

  await revalidatePath('/tickets');
  return { success: true };
}

// Wrapper for form actions (HTML form requires void return)
export async function archiveTicketFormAction(formData: FormData): Promise<void> {
  await toggleArchiveTicketAction(formData);
}

export async function applyFiltersAction(formData: FormData) {
  'use server';
  const rawQuery = formData.get('q');
  const rawStatus = formData.get('status');
  const rawClickUp = formData.get('clickup');
  const rawArchived = formData.get('archived');
  const intent = formData.get('intent');
  const shouldRedirect = intent !== 'instant';

  const cookieStore = await cookies();
  const current = parseViewState(cookieStore.get(TICKETS_VIEW_COOKIE)?.value);
  const trimmedQuery = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  const candidateStatus = typeof rawStatus === 'string' ? rawStatus : '';
  const candidateClickUp = typeof rawClickUp === 'string' ? rawClickUp : '';
  const candidateArchived = typeof rawArchived === 'string' ? rawArchived : '';
  const hasQueryField = formData.has('q');
  const hasStatusField = formData.has('status');
  const hasClickUpField = formData.has('clickup');
  const hasArchivedField = formData.has('archived');
  const nextQuery =
    hasQueryField && trimmedQuery.length === 0
      ? null
      : hasQueryField && trimmedQuery.length > 0
        ? trimmedQuery
        : current.query;
  const nextStatus =
    hasStatusField && candidateStatus
      ? (STATUS_OPTIONS.includes(candidateStatus as RequestStatus)
          ? (candidateStatus as RequestStatus)
          : current.status)
      : hasStatusField
        ? null
        : current.status;
  let nextHasClickUp: boolean | null = current.hasClickUp;
  if (hasClickUpField) {
    if (candidateClickUp === 'with') nextHasClickUp = true;
    else if (candidateClickUp === 'without') nextHasClickUp = false;
    else nextHasClickUp = null;
  }
  const nextArchivedFilter =
    hasArchivedField && candidateArchived
      ? (['active', 'archived', 'all'].includes(candidateArchived) ? candidateArchived : current.archivedFilter)
      : hasArchivedField
        ? 'active'
        : current.archivedFilter;

  const next = {
    query: nextQuery,
    status: nextStatus,
    perPage: current.perPage,
    page: 1,
    hasClickUp: nextHasClickUp,
    archivedFilter: nextArchivedFilter,
  };

  cookieStore.set({
    name: TICKETS_VIEW_COOKIE,
    value: JSON.stringify(next),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TICKETS_VIEW_COOKIE_MAX_AGE,
    path: '/',
  });
  if (shouldRedirect) {
    redirect('/tickets');
  }
  await revalidatePath('/tickets');
}

export async function resetFiltersAction() {
  'use server';
  const cookieStore = await cookies();
  cookieStore.delete(TICKETS_VIEW_COOKIE);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = formatter.format(new Date());
  cookieStore.set({
    name: DATE_RANGE_COOKIE,
    value: `${today}|${today}`,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DATE_RANGE_COOKIE_MAX_AGE,
    path: '/',
  });
  await revalidatePath('/tickets');
  redirect('/tickets');
}

export async function changePerPageAction(formData: FormData) {
  'use server';
  const perPageCandidate = Number(formData.get('perPage'));
  if (!PER_PAGE_OPTIONS.includes(perPageCandidate as (typeof PER_PAGE_OPTIONS)[number])) {
    redirect('/tickets');
  }

  const perPage = perPageCandidate as (typeof PER_PAGE_OPTIONS)[number];
  const intent = formData.get('intent');
  const shouldRedirect = intent !== 'instant';
  const cookieStore = await cookies();
  const current = parseViewState(cookieStore.get(TICKETS_VIEW_COOKIE)?.value);
  const next = {
    ...current,
    perPage,
    page: 1,
  };

  cookieStore.set({
    name: TICKETS_VIEW_COOKIE,
    value: JSON.stringify(next),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TICKETS_VIEW_COOKIE_MAX_AGE,
    path: '/',
  });
  if (shouldRedirect) {
    redirect('/tickets');
  }
  await revalidatePath('/tickets');
}

export async function changePageAction(formData: FormData) {
  'use server';
  const pageCandidate = Number(formData.get('page'));
  if (!Number.isFinite(pageCandidate)) {
    redirect('/tickets');
  }

  const intent = formData.get('intent');
  const shouldRedirect = intent !== 'instant';
  const cookieStore = await cookies();
  const current = parseViewState(cookieStore.get(TICKETS_VIEW_COOKIE)?.value);
  const nextPage = Math.max(1, Math.floor(pageCandidate));
  const next = {
    ...current,
    page: nextPage,
  };

  cookieStore.set({
    name: TICKETS_VIEW_COOKIE,
    value: JSON.stringify(next),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TICKETS_VIEW_COOKIE_MAX_AGE,
    path: '/',
  });
  if (shouldRedirect) {
    redirect('/tickets');
  }
  await revalidatePath('/tickets');
}
