'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import styles from './merchants.module.css';
import type { FranchiseSummary } from '@/lib/franchise';

interface MerchantsClientProps {
  franchises: FranchiseSummary[];
  totalCount: number | null;
  page: number;
  perPage: number;
  totalPages: number | null;
  previousPage: number | null;
  nextPage: number | null;
  initialQuery?: string;
  dataUnavailable?: boolean;
}

const formatOutletName = (name: string | null): string => {
  const cleaned = (name ?? '').trim();
  return cleaned || 'Unnamed outlet';
};

const formatOutletId = (id: string | null): string => {
  const cleaned = (id ?? '').trim();
  return cleaned ? `OID ${cleaned}` : 'OID -';
};

const formatFranchiseName = (name: string | null, fid: string | null): string => {
  const cleaned = (name ?? '').trim();
  if (cleaned) {
    return cleaned;
  }
  return fid ? `Franchise ${fid}` : 'Unnamed franchise';
};

const buildPageHref = (page: number, query: string): string => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (query.trim()) {
    params.set('q', query.trim());
  }
  return `?${params.toString()}`;
};

export default function MerchantsClient({
  franchises,
  totalCount,
  page,
  perPage,
  totalPages,
  previousPage,
  nextPage,
  initialQuery,
  dataUnavailable,
}: MerchantsClientProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const trimmedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmedQuery) {
      return franchises;
    }
    return franchises.filter((franchise) => {
      const values: string[] = [];
      if (franchise.fid) {
        values.push(franchise.fid);
      }
      if (franchise.name) {
        values.push(franchise.name);
      }
      franchise.outlets.forEach((outlet) => {
        if (outlet.name) {
          values.push(outlet.name);
        }
        if (outlet.id) {
          values.push(outlet.id);
        }
      });
      return values.some((value) => value.toLowerCase().includes(trimmedQuery));
    });
  }, [franchises, trimmedQuery]);

  return (
    <section className={styles.directoryCard}>
      <header className={styles.directoryHeader}>
        <div>
          <p className={styles.directoryLabel}>Franchise list</p>
          <h2 className={styles.directoryTitle}>Merchants & outlets</h2>
          <p className={styles.directorySubtitle}>Expand a franchise to see every outlet tied to it.</p>
        </div>
        <label className={styles.searchField}>
          <span className={styles.searchLabel}>Search</span>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by franchise, FID, or outlet"
            type="search"
          />
        </label>
      </header>

      <div className={styles.metaRow}>
        <span>
          Showing {filtered.length} of {franchises.length} franchises on this page
        </span>
        <span>
          {typeof totalCount === 'number' ? `Total franchises: ${totalCount}` : `Page size: ${perPage}`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.emptyState}>
          {dataUnavailable ? 'No franchise data is available right now.' : 'No franchises match this search.'}
        </p>
      ) : (
        <ul className={styles.franchiseList}>
          {filtered.map((franchise, index) => {
            const fid = franchise.fid ?? '';
            const name = formatFranchiseName(franchise.name, franchise.fid);
            const key = fid || name ? `${fid}-${name}` : `franchise-${index}`;
            return (
              <li key={key} className={styles.franchiseCard}>
                <details className={styles.franchiseDetails}>
                  <summary className={styles.franchiseSummary}>
                    <div className={styles.franchiseSummaryText}>
                      <span className={styles.franchiseName}>{name}</span>
                      <span className={styles.franchiseMeta}>
                        FID {fid || '-'} - {franchise.outlets.length} outlets
                      </span>
                    </div>
                  </summary>
                  <div className={styles.outletListWrapper}>
                    {franchise.outlets.length === 0 ? (
                      <p className={styles.emptyOutlet}>No outlets listed for this franchise yet.</p>
                    ) : (
                      <ul className={styles.outletList}>
                        {franchise.outlets.map((outlet, outletIndex) => (
                          <li
                            key={`${fid || name}-outlet-${outlet.id ?? outletIndex}`}
                            className={styles.outletItem}
                          >
                            <span className={styles.outletName}>{formatOutletName(outlet.name)}</span>
                            <span className={styles.outletTag}>{formatOutletId(outlet.id)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.pagination}>
        {previousPage ? (
          <Link className={styles.paginationButton} href={buildPageHref(previousPage, query)}>
            Previous
          </Link>
        ) : (
          <span className={styles.paginationButtonDisabled}>Previous</span>
        )}
        <span className={styles.paginationStatus}>
          Page {page}
          {totalPages ? ` of ${totalPages}` : ''}
        </span>
        {nextPage ? (
          <Link className={styles.paginationButton} href={buildPageHref(nextPage, query)}>
            Next
          </Link>
        ) : (
          <span className={styles.paginationButtonDisabled}>Next</span>
        )}
      </div>
    </section>
  );
}
