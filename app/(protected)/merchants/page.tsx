import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import styles from '../tickets/tickets.module.css';
import MerchantsClient from './MerchantsClient';
import {
  applyMerchantsSearchAction,
  changeMerchantsAccountFiltersAction,
  changeMerchantsPageAction,
  changeMerchantsPerPageAction,
  changeMerchantsSortAction,
} from './actions';
import { DEFAULT_PER_PAGE, DEFAULT_SORT_DIRECTION, DEFAULT_SORT_KEY } from './constants';
import { parseMerchantsViewState } from './view-state';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessMerchantsPages } from '@/lib/branding';
import {
  getFranchiseMetrics,
  getLatestCompletedFranchiseImport,
  listCachedFranchises,
  searchCachedFranchises,
} from '@/lib/franchise-cache';
import type { FranchiseSummary } from '@/lib/franchise';
import { MERCHANTS_VIEW_COOKIE } from '@/lib/preferences';

export const dynamic = 'force-dynamic';

const IMPORT_TIMEZONE = 'Asia/Kuala_Lumpur';

const formatImportTimestamp = (value: string | null): string => {
  if (!value) {
    return 'Not imported yet';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not imported yet';
  }
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: IMPORT_TIMEZONE,
  }).format(parsed);
};

export default async function MerchantsPage() {
  const authUser = await getAuthenticatedUser();
  if (!canAccessMerchantsPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }
  const canStartImport = canAccessMerchantsPages(authUser.department, authUser.isSuperAdmin);

  const cookieStore = await cookies();
  const viewState = parseMerchantsViewState(cookieStore.get(MERCHANTS_VIEW_COOKIE)?.value);

  const page = viewState.page ?? 1;
  const initialQuery = viewState.query ?? '';
  const perPage = viewState.perPage ?? DEFAULT_PER_PAGE;
  const sortKey = viewState.sortKey ?? DEFAULT_SORT_KEY;
  const sortDirection = viewState.sortDirection ?? DEFAULT_SORT_DIRECTION;
  const accountType = viewState.accountType ?? 'all';
  const hasQuery = initialQuery.length > 0;

  let dataLoadFailed = false;
  let franchises: FranchiseSummary[] = [];
  let totalPages = 1;
  let currentPage = page;
  let totalCount = 0;
  let totalActiveOutlets = 0;
  let lastImportDisplay = 'Not imported yet';

  try {
    if (hasQuery) {
      const matchingFranchises = await searchCachedFranchises(
        initialQuery,
        {
          key: sortKey,
          direction: sortDirection,
        },
        { accountType },
      );
      totalCount = matchingFranchises.length;
      totalPages = Math.max(1, Math.ceil(totalCount / perPage));
      currentPage = Math.min(page, totalPages);
      const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * perPage;
      const endIndex = totalCount === 0 ? 0 : startIndex + perPage;
      franchises = totalCount === 0 ? [] : matchingFranchises.slice(startIndex, endIndex);
    } else {
      const pageResponse = await listCachedFranchises(
        page,
        perPage,
        { key: sortKey, direction: sortDirection },
        { accountType },
      );
      totalCount = pageResponse.totalCount;
      totalPages = Math.max(1, Math.ceil(totalCount / perPage));
      currentPage = Math.min(page, totalPages);
      if (currentPage !== page) {
        const fallbackResponse = await listCachedFranchises(
          currentPage,
          perPage,
          {
            key: sortKey,
            direction: sortDirection,
          },
          { accountType },
        );
        franchises = fallbackResponse.franchises;
        totalCount = fallbackResponse.totalCount;
      } else {
        franchises = pageResponse.franchises;
      }
    }
  } catch (error) {
    dataLoadFailed = true;
    console.error('Failed to load franchise list', error);
  }

  try {
    const metrics = await getFranchiseMetrics();
    totalActiveOutlets = metrics.totalActiveOutlets;
  } catch (error) {
    console.error('Failed to load franchise metrics', error);
  }

  try {
    const latestImport = await getLatestCompletedFranchiseImport();
    const importTimestamp = latestImport?.finishedAt ?? latestImport?.startedAt ?? null;
    lastImportDisplay = formatImportTimestamp(importTimestamp);
  } catch (error) {
    console.error('Failed to load latest franchise import', error);
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.heroTitle}>Merchant Directory</h1>
            <p className={styles.heroSubtitle}>
              Browse cached franchise data synced nightly at 12:15 AM. Only franchises with outlets are listed (25 per
              page), with the most recent entries shown first.
            </p>
          </div>
        </div>
      </section>

      <MerchantsClient
        franchises={franchises}
        canStartImport={canStartImport}
        lastImportDisplay={lastImportDisplay}
        page={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        perPage={perPage}
        totalActiveOutlets={totalActiveOutlets}
        initialQuery={initialQuery}
        sortKey={sortKey}
        sortDirection={sortDirection}
        accountType={accountType}
        dataUnavailable={dataLoadFailed}
        onSearch={applyMerchantsSearchAction}
        onPerPageChange={changeMerchantsPerPageAction}
        onPageChange={changeMerchantsPageAction}
        onSortChange={changeMerchantsSortAction}
        onFilterChange={changeMerchantsAccountFiltersAction}
      />
    </div>
  );
}
