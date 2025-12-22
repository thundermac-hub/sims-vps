'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import ticketStyles from '../tickets/tickets.module.css';
import styles from './merchants.module.css';
import type { FranchiseSummary } from '@/lib/franchise';

interface MerchantsClientProps {
  franchises: FranchiseSummary[];
  page: number;
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
  page,
  totalPages,
  previousPage,
  nextPage,
  initialQuery,
  dataUnavailable,
}: MerchantsClientProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const trimmedQuery = query.trim().toLowerCase();

  const outletFranchises = useMemo(() => franchises.filter((franchise) => franchise.outlets.length > 0), [franchises]);

  const filtered = useMemo(() => {
    if (!trimmedQuery) {
      return outletFranchises;
    }
    return outletFranchises.filter((franchise) => {
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
  }, [outletFranchises, trimmedQuery]);

  const emptyMessage = dataUnavailable
    ? 'Unable to load franchise data. Please refresh and try again.'
    : trimmedQuery
      ? 'No franchises match this search.'
      : 'No franchises with outlets were found on this page.';

  const headerMeta = dataUnavailable ? 'Data unavailable' : `${filtered.length} results`;

  return (
    <>
      <div className={ticketStyles.filtersCard}>
        <div className={ticketStyles.filtersGrid}>
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by franchise, FID, or outlet"
              type="search"
            />
          </label>
        </div>
      </div>

      <section className={ticketStyles.tableCard}>
        <div className={ticketStyles.tableHeader}>
          <h2>Franchises</h2>
          <span>{headerMeta}</span>
        </div>
        <div className={ticketStyles.tableWrapper}>
          <table className={ticketStyles.table}>
            <thead>
              <tr>
                <th>Franchise</th>
                <th>FID</th>
                <th>Outlets</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className={ticketStyles.empty}>
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filtered.map((franchise, index) => {
                  const fid = franchise.fid ?? '';
                  const name = formatFranchiseName(franchise.name, franchise.fid);
                  const key = fid || name ? `${fid}-${name}` : `franchise-${index}`;
                  return (
                    <tr key={key}>
                      <td colSpan={3} className={styles.franchiseCell} data-label="Franchise">
                        <details className={styles.franchiseDetails}>
                          <summary className={styles.franchiseSummary}>
                            <div className={styles.franchiseSummaryText}>
                              <span className={ticketStyles.primaryText}>{name}</span>
                              <span className={ticketStyles.secondaryText}>
                                FID {fid || '-'} - {franchise.outlets.length} outlets
                              </span>
                            </div>
                          </summary>
                          <div className={styles.outletListWrapper}>
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
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className={ticketStyles.paginationBar}>
          <span className={ticketStyles.paginationInfo}>
            Showing {filtered.length} of {outletFranchises.length} franchises on this page
          </span>
          <div className={ticketStyles.paginationControls}>
            {previousPage ? (
              <Link className={ticketStyles.paginationButton} href={buildPageHref(previousPage, query)}>
                Previous
              </Link>
            ) : (
              <span className={`${ticketStyles.paginationButton} ${ticketStyles.paginationButtonDisabled}`}>
                Previous
              </span>
            )}
            <span className={ticketStyles.paginationPageIndicator}>
              Page {page}
              {totalPages ? ` of ${totalPages}` : ''}
            </span>
            {nextPage ? (
              <Link className={ticketStyles.paginationButton} href={buildPageHref(nextPage, query)}>
                Next
              </Link>
            ) : (
              <span className={`${ticketStyles.paginationButton} ${ticketStyles.paginationButtonDisabled}`}>Next</span>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
