import { redirect } from 'next/navigation';
import styles from '../tickets/tickets.module.css';
import MerchantsClient from './MerchantsClient';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages } from '@/lib/branding';
import { listCachedFranchises } from '@/lib/franchise-cache';
import type { FranchiseSummary } from '@/lib/franchise';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

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

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams?: { page?: string | string[]; q?: string | string[] };
}) {
  const authUser = await getAuthenticatedUser();
  if (!canAccessSupportPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }

  const page = parsePage(searchParams?.page);
  const initialQuery = Array.isArray(searchParams?.q) ? searchParams?.q[0] ?? '' : searchParams?.q ?? '';

  let dataLoadFailed = false;
  let franchises: FranchiseSummary[] = [];
  let totalPages = 1;
  let currentPage = page;
  let totalCount = 0;

  try {
    const pageResponse = await listCachedFranchises(page, PAGE_SIZE);
    totalCount = pageResponse.totalCount;
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    currentPage = Math.min(page, totalPages);
    if (currentPage !== page) {
      const fallbackResponse = await listCachedFranchises(currentPage, PAGE_SIZE);
      franchises = fallbackResponse.franchises;
      totalCount = fallbackResponse.totalCount;
    } else {
      franchises = pageResponse.franchises;
    }
  } catch (error) {
    dataLoadFailed = true;
    console.error('Failed to load franchise list', error);
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
        initialQuery={initialQuery}
        dataUnavailable={dataLoadFailed}
      />
    </div>
  );
}
