import { redirect } from 'next/navigation';
import styles from './merchants.module.css';
import MerchantsClient from './MerchantsClient';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages } from '@/lib/branding';
import { fetchFranchiseList, type FranchiseSummary } from '@/lib/franchise';

export const dynamic = 'force-dynamic';

const PER_PAGE = 25;

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

const fidSortValue = (fid: string | null): number => {
  const digits = (fid ?? '').replace(/\D/g, '');
  if (!digits) {
    return -1;
  }
  const parsed = Number(digits);
  return Number.isNaN(parsed) ? -1 : parsed;
};

const sortFranchises = (franchises: FranchiseSummary[]): FranchiseSummary[] =>
  [...franchises].sort((a, b) => {
    const diff = fidSortValue(b.fid) - fidSortValue(a.fid);
    if (diff !== 0) {
      return diff;
    }
    const nameA = a.name ?? '';
    const nameB = b.name ?? '';
    return nameA.localeCompare(nameB, 'en', { sensitivity: 'base' });
  });

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
  let totalCount: number | null = null;
  let totalPages: number | null = null;
  let currentPage = page;
  let perPage = PER_PAGE;

  try {
    const response = await fetchFranchiseList(page, PER_PAGE);
    franchises = sortFranchises(response.franchises);
    totalCount = response.totalCount;
    totalPages = response.totalPages;
    currentPage = response.currentPage;
    perPage = response.perPage || PER_PAGE;
  } catch (error) {
    dataLoadFailed = true;
    console.error('Failed to load franchise list', error);
  }

  const totalOutlets = franchises.reduce((sum, franchise) => sum + franchise.outlets.length, 0);
  const previousPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = totalPages
    ? currentPage < totalPages
      ? currentPage + 1
      : null
    : franchises.length === perPage
      ? currentPage + 1
      : null;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.heroKicker}>Merchant Directory</p>
        <h1 className={styles.heroTitle}>Franchise & Outlet Index</h1>
        <p className={styles.heroSubtitle}>
          Browse franchises from the Slurp API and expand each record to see its outlet list.
        </p>
        {dataLoadFailed ? (
          <p className={styles.errorNotice}>
            Unable to load franchise data right now. Refresh the page or try again shortly.
          </p>
        ) : null}
        <div className={styles.heroMeta}>
          <span className={styles.heroBadge}>Page {currentPage}</span>
          <span className={styles.heroBadge}>Sorted by FID</span>
          <span className={styles.heroBadge}>Per page: {perPage}</span>
        </div>
      </section>

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Franchises on page</p>
          <p className={styles.statValue}>{franchises.length}</p>
          <p className={styles.statHint}>Showing up to {perPage} records</p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Total outlets on page</p>
          <p className={styles.statValue}>{totalOutlets}</p>
          <p className={styles.statHint}>Across visible franchises</p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Total franchises</p>
          <p className={styles.statValue}>{typeof totalCount === 'number' ? totalCount : '-'}</p>
          <p className={styles.statHint}>API-reported count</p>
        </article>
      </section>

      <MerchantsClient
        franchises={franchises}
        totalCount={totalCount}
        page={currentPage}
        perPage={perPage}
        totalPages={totalPages}
        previousPage={previousPage}
        nextPage={nextPage}
        initialQuery={initialQuery}
        dataUnavailable={dataLoadFailed}
      />
    </div>
  );
}
