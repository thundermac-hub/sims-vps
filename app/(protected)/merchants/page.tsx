import { redirect } from 'next/navigation';
import styles from '../tickets/tickets.module.css';
import MerchantsClient from './MerchantsClient';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages } from '@/lib/branding';
import { fetchAllFranchises, type FranchiseSummary } from '@/lib/franchise';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const API_PAGE_SIZE = 25;
const MAX_API_PAGES = 4;

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

const sortFranchises = (franchises: FranchiseSummary[]): FranchiseSummary[] => {
  const indexed = franchises.map((franchise, index) => ({ franchise, index }));
  indexed.sort((a, b) => {
    const diff = fidSortValue(b.franchise.fid) - fidSortValue(a.franchise.fid);
    if (diff !== 0) {
      return diff;
    }
    return b.index - a.index;
  });
  return indexed.map((entry) => entry.franchise);
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

  try {
    const response = await fetchAllFranchises(API_PAGE_SIZE, MAX_API_PAGES);
    const filtered = response.filter((franchise) => franchise.outlets.length > 0);
    const sorted = sortFranchises(filtered);
    totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    franchises = sorted.slice(startIndex, startIndex + PAGE_SIZE);
  } catch (error) {
    dataLoadFailed = true;
    console.error('Failed to load franchise list', error);
  }

  const previousPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = currentPage < totalPages ? currentPage + 1 : null;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.heroTitle}>Merchant Directory</h1>
            <p className={styles.heroSubtitle}>
              Browse franchises from the Slurp API, sorted by FID in descending order. Only franchises with outlets are
              listed (25 per page).
            </p>
          </div>
        </div>
      </section>

      <MerchantsClient
        franchises={franchises}
        page={currentPage}
        totalPages={totalPages}
        previousPage={previousPage}
        nextPage={nextPage}
        initialQuery={initialQuery}
        dataUnavailable={dataLoadFailed}
      />
    </div>
  );
}
