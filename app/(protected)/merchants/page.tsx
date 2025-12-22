import { redirect } from 'next/navigation';
import styles from '../tickets/tickets.module.css';
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
  let fetchedCount = 0;
  let totalPages: number | null = null;
  let currentPage = page;
  let perPage = PER_PAGE;

  try {
    const response = await fetchFranchiseList(page, PER_PAGE);
    fetchedCount = response.franchises.length;
    franchises = sortFranchises(response.franchises.filter((franchise) => franchise.outlets.length > 0));
    totalPages = response.totalPages;
    currentPage = response.currentPage;
    perPage = response.perPage || PER_PAGE;
  } catch (error) {
    dataLoadFailed = true;
    console.error('Failed to load franchise list', error);
  }

  const previousPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = totalPages
    ? currentPage < totalPages
      ? currentPage + 1
      : null
    : fetchedCount === perPage
      ? currentPage + 1
      : null;

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
