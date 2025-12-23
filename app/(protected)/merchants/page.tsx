import { redirect } from 'next/navigation';
import styles from '../tickets/tickets.module.css';
import MerchantsClient from './MerchantsClient';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages } from '@/lib/branding';
import { getFranchiseMetrics, listCachedFranchises } from '@/lib/franchise-cache';
import type { FranchiseSummary } from '@/lib/franchise';

export const dynamic = 'force-dynamic';

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PER_PAGE = 25;

const parsePage = (value: string | string[] | undefined): number => {
  if (Array.isArray(value)) {
    return parsePage(value[0]);
  }
  if (!value) {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
};

const parsePerPage = (value: string | string[] | undefined): number => {
  if (Array.isArray(value)) {
    return parsePerPage(value[0]);
  }
  if (!value) {
    return DEFAULT_PER_PAGE;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PER_PAGE;
  }
  return PER_PAGE_OPTIONS.includes(parsed as (typeof PER_PAGE_OPTIONS)[number]) ? parsed : DEFAULT_PER_PAGE;
};

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams?: { page?: string | string[]; q?: string | string[]; perPage?: string | string[] };
}) {
  const authUser = await getAuthenticatedUser();
  if (!canAccessSupportPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }

  const page = parsePage(searchParams?.page);
  const initialQuery = Array.isArray(searchParams?.q) ? searchParams?.q[0] ?? '' : searchParams?.q ?? '';
  const perPage = parsePerPage(searchParams?.perPage);

  let dataLoadFailed = false;
  let franchises: FranchiseSummary[] = [];
  let totalPages = 1;
  let currentPage = page;
  let totalCount = 0;
  let totalActiveOutlets = 0;

  try {
    const pageResponse = await listCachedFranchises(page, perPage);
    totalCount = pageResponse.totalCount;
    totalPages = Math.max(1, Math.ceil(totalCount / perPage));
    currentPage = Math.min(page, totalPages);
    if (currentPage !== page) {
      const fallbackResponse = await listCachedFranchises(currentPage, perPage);
      franchises = fallbackResponse.franchises;
      totalCount = fallbackResponse.totalCount;
    } else {
      franchises = pageResponse.franchises;
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
        page={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        perPage={perPage}
        totalActiveOutlets={totalActiveOutlets}
        initialQuery={initialQuery}
        dataUnavailable={dataLoadFailed}
      />
    </div>
  );
}
