'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MERCHANTS_VIEW_COOKIE, MERCHANTS_VIEW_COOKIE_MAX_AGE } from '@/lib/preferences';
import { PER_PAGE_OPTIONS, type SortDirection, type SortKey } from './constants';
import { parseMerchantsViewState } from './view-state';

const parsePageValue = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const parsePerPageValue = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return PER_PAGE_OPTIONS.includes(parsed as (typeof PER_PAGE_OPTIONS)[number]) ? parsed : fallback;
};

const parseSortKey = (value: unknown, fallback: SortKey): SortKey => {
  if (value === 'fid' || value === 'franchise' || value === 'outlets') {
    return value;
  }
  return fallback;
};

const parseSortDirection = (value: unknown, fallback: SortDirection): SortDirection => {
  if (value === 'asc' || value === 'desc') {
    return value;
  }
  return fallback;
};

const persistViewState = async (next: ReturnType<typeof parseMerchantsViewState>) => {
  const cookieStore = await cookies();
  cookieStore.set({
    name: MERCHANTS_VIEW_COOKIE,
    value: JSON.stringify(next),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MERCHANTS_VIEW_COOKIE_MAX_AGE,
    path: '/',
  });
};

export async function applyMerchantsSearchAction(formData: FormData) {
  'use server';
  const rawQuery = formData.get('q');
  const intent = formData.get('intent');
  const shouldRedirect = intent !== 'instant';

  const cookieStore = await cookies();
  const current = parseMerchantsViewState(cookieStore.get(MERCHANTS_VIEW_COOKIE)?.value);
  const trimmedQuery = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  const hasQueryField = formData.has('q');
  const nextQuery =
    hasQueryField && trimmedQuery.length === 0
      ? null
      : hasQueryField && trimmedQuery.length > 0
        ? trimmedQuery
        : current.query;

  const next = {
    ...current,
    query: nextQuery,
    page: 1,
  };

  await persistViewState(next);

  if (shouldRedirect) {
    redirect('/merchants');
  }

  await revalidatePath('/merchants');
}

export async function changeMerchantsPerPageAction(formData: FormData) {
  'use server';
  const rawPerPage = formData.get('perPage');
  const cookieStore = await cookies();
  const current = parseMerchantsViewState(cookieStore.get(MERCHANTS_VIEW_COOKIE)?.value);
  const nextPerPage = parsePerPageValue(rawPerPage, current.perPage);
  const next = {
    ...current,
    perPage: nextPerPage,
    page: 1,
  };
  await persistViewState(next);
  await revalidatePath('/merchants');
}

export async function changeMerchantsPageAction(formData: FormData) {
  'use server';
  const rawPage = formData.get('page');
  const cookieStore = await cookies();
  const current = parseMerchantsViewState(cookieStore.get(MERCHANTS_VIEW_COOKIE)?.value);
  const nextPage = parsePageValue(rawPage, current.page);
  const next = {
    ...current,
    page: nextPage,
  };
  await persistViewState(next);
  await revalidatePath('/merchants');
}

export async function changeMerchantsSortAction(formData: FormData) {
  'use server';
  const rawSortKey = formData.get('sort');
  const rawSortDirection = formData.get('dir');
  const cookieStore = await cookies();
  const current = parseMerchantsViewState(cookieStore.get(MERCHANTS_VIEW_COOKIE)?.value);
  const nextSortKey = parseSortKey(rawSortKey, current.sortKey);
  const nextSortDirection = parseSortDirection(rawSortDirection, current.sortDirection);
  const next = {
    ...current,
    sortKey: nextSortKey,
    sortDirection: nextSortDirection,
    page: 1,
  };
  await persistViewState(next);
  await revalidatePath('/merchants');
}
