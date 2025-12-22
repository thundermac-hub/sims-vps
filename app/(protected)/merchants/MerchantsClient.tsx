'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import ticketStyles from '../tickets/tickets.module.css';
import styles from './merchants.module.css';
import type { FranchiseSummary } from '@/lib/franchise';

interface MerchantsClientProps {
  franchises: FranchiseSummary[];
  totalCount: number;
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
  totalCount,
  page,
  totalPages,
  previousPage,
  nextPage,
  initialQuery,
  dataUnavailable,
}: MerchantsClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery ?? '');
  const trimmedQuery = query.trim().toLowerCase();
  const [importJob, setImportJob] = useState<FranchiseImportJob | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isStartingImport, setIsStartingImport] = useState(false);

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
      : totalCount === 0
        ? 'No cached franchise data yet. Run a manual import to load the latest list.'
        : 'No franchises with outlets were found on this page.';

  const headerMeta = dataUnavailable ? 'Data unavailable' : `${totalCount} total franchises`;

  useEffect(() => {
    if (!importJob || importJob.status !== 'running') {
      return;
    }

    let active = true;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/merchants/import/${importJob.id}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to check import status.');
        }
        if (!active) {
          return;
        }
        setImportJob(payload.job);
      } catch (error) {
        if (active) {
          setImportError(error instanceof Error ? error.message : 'Unable to check import status.');
        }
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [importJob?.id, importJob?.status]);

  useEffect(() => {
    if (importJob?.status === 'completed') {
      router.refresh();
    }
  }, [importJob?.status, router]);

  const startImport = async () => {
    setImportError(null);
    setIsStartingImport(true);
    try {
      const response = await fetch('/api/merchants/import', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to start import.');
      }
      setImportJob(payload.job);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to start import.');
    } finally {
      setIsStartingImport(false);
    }
  };

  const progressPercent =
    importJob && typeof importJob.totalCount === 'number' && importJob.totalCount > 0
      ? Math.min(100, Math.round((importJob.processedCount / importJob.totalCount) * 100))
      : null;

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
        <div className={styles.importBar}>
          <button
            type="button"
            className={styles.importButton}
            onClick={startImport}
            disabled={isStartingImport || importJob?.status === 'running'}
          >
            {importJob?.status === 'running' ? 'Importing...' : 'Import latest data'}
          </button>
          <div className={styles.importStatus}>
            {importJob ? (
              <>
                <span className={styles.importLabel}>
                  {importJob.status === 'running'
                    ? `Imported ${importJob.processedCount} franchises`
                    : importJob.status === 'completed'
                      ? 'Import complete'
                      : 'Import failed'}
                </span>
                {importJob.status === 'running' && progressPercent !== null ? (
                  <span className={styles.importPercent}>{progressPercent}%</span>
                ) : null}
              </>
            ) : isStartingImport ? (
              <span className={styles.importLabel}>Starting import...</span>
            ) : (
              <span className={styles.importLabel}>Use the button to refresh the cached list.</span>
            )}
          </div>
          {importJob?.status === 'running' && progressPercent !== null ? (
            <div className={styles.progressBar} aria-hidden="true">
              <span className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
          ) : null}
          {importError ? <p className={styles.importError}>{importError}</p> : null}
          {importJob?.status === 'failed' && importJob.errorMessage ? (
            <p className={styles.importError}>{importJob.errorMessage}</p>
          ) : null}
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
            Showing {filtered.length} of {outletFranchises.length} on this page - {totalCount} total
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

type FranchiseImportJob = {
  id: number;
  status: 'running' | 'completed' | 'failed';
  processedCount: number;
  totalCount: number | null;
  errorMessage: string | null;
};
