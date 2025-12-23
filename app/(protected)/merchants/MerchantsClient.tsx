'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import ticketStyles from '../tickets/tickets.module.css';
import styles from './merchants.module.css';
import type { FranchiseSummary } from '@/lib/franchise';

interface MerchantsClientProps {
  franchises: FranchiseSummary[];
  totalCount: number;
  totalActiveOutlets: number;
  page: number;
  totalPages: number | null;
  perPage: number;
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

const normalizeDateInput = (value: string): string =>
  value.replace(/([+-]\d{2})(\d{2})$/, (_match, hours, minutes) => `${hours}:${minutes}`);

const parseDateTime = (value: string | null): Date | null => {
  const cleaned = (value ?? '').trim();
  if (!cleaned) {
    return null;
  }
  const normalised = normalizeDateInput(cleaned);
  const parsed = Date.parse(normalised);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed);
};

const formatDetailValue = (value: string | null): string => {
  const cleaned = (value ?? '').trim();
  return cleaned || '-';
};

const formatDateTime = (value: string | null): string => {
  const date = parseDateTime(value);
  if (!date) {
    const cleaned = (value ?? '').trim();
    return cleaned || '-';
  }
  const datePart = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .toUpperCase();
  return `${datePart} ${timePart}`;
};

const buildFranchiseLink = (fid: string | null): string | null => {
  const cleaned = (fid ?? '').trim();
  if (!cleaned) {
    return null;
  }
  return `https://cloud.getslurp.com/batcave/franchise/${encodeURIComponent(cleaned)}`;
};

const buildPageHref = (page: number, query: string, perPage: number): string => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('perPage', String(perPage));
  if (query.trim()) {
    params.set('q', query.trim());
  }
  return `?${params.toString()}`;
};

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

export default function MerchantsClient({
  franchises,
  totalCount,
  totalActiveOutlets,
  page,
  totalPages,
  perPage,
  initialQuery,
  dataUnavailable,
}: MerchantsClientProps) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
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

  const totalPagesSafe = totalPages ?? 1;
  const paginationPages = useMemo(() => {
    if (totalPagesSafe <= 1) {
      return [page];
    }
    const windowSize = 2;
    let start = Math.max(1, page - windowSize);
    let end = Math.min(totalPagesSafe, page + windowSize);
    if (page <= windowSize) {
      end = Math.min(totalPagesSafe, 1 + windowSize * 2);
    }
    if (page + windowSize >= totalPagesSafe) {
      start = Math.max(1, totalPagesSafe - windowSize * 2);
    }
    const pages: number[] = [];
    for (let current = start; current <= end; current += 1) {
      pages.push(current);
    }
    return pages;
  }, [page, totalPagesSafe]);

  const navigateTo = (nextPage: number, nextPerPage = perPage) => {
    const href = buildPageHref(nextPage, query, nextPerPage);
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  };

  const handlePerPageChange = (nextPerPage: number) => {
    navigateTo(1, nextPerPage);
  };

  const visibleOutletCount = useMemo(
    () => filtered.reduce((total, franchise) => total + franchise.outlets.length, 0),
    [filtered],
  );

  const startIndex = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const endIndex = totalCount === 0 ? 0 : Math.min(totalCount, page * perPage);
  const activeOutletCount = totalActiveOutlets;

  const emptyMessage = dataUnavailable
    ? 'Unable to load franchise data. Please refresh and try again.'
    : trimmedQuery
      ? 'No franchises match this search.'
      : totalCount === 0
        ? 'No cached franchise data yet. Run a manual import to load the latest list.'
        : 'No franchises with outlets were found on this page.';

  const headerMeta = dataUnavailable ? 'Data unavailable' : `Page ${page} of ${totalPagesSafe}`;

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
  const showImportModal = isStartingImport || importJob?.status === 'running';

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
                    ? `Processed ${importJob.processedCount} of ${importJob.totalCount ?? '...'}`
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
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Total Franchises</span>
            <span className={styles.metricValue}>{totalCount}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Outlets On Page</span>
            <span className={styles.metricValue}>{visibleOutletCount}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Active Outlets</span>
            <span className={styles.metricValue}>{activeOutletCount}</span>
          </div>
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
                  const franchiseLink = buildFranchiseLink(franchise.fid);
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
                            <div className={styles.detailGrid}>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Company</span>
                                <span className={styles.detailValue}>{formatDetailValue(franchise.company ?? null)}</span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Company Address</span>
                                <span className={styles.detailValue}>
                                  {formatDetailValue(franchise.companyAddress ?? null)}
                                </span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Created At</span>
                                <span className={styles.detailValue}>{formatDateTime(franchise.createdAt ?? null)}</span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Updated At</span>
                                <span className={styles.detailValue}>{formatDateTime(franchise.updatedAt ?? null)}</span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Cloud Link</span>
                                {franchiseLink ? (
                                  <a
                                    className={styles.detailLink}
                                    href={franchiseLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open in Cloud
                                  </a>
                                ) : (
                                  <span className={styles.detailValue}>-</span>
                                )}
                              </div>
                            </div>
                            <ul className={styles.outletList}>
                              {franchise.outlets.map((outlet, outletIndex) => (
                                <li
                                  key={`${fid || name}-outlet-${outlet.id ?? outletIndex}`}
                                  className={styles.outletItem}
                                >
                                  <div className={styles.outletHeader}>
                                    <span className={styles.outletName}>{formatOutletName(outlet.name)}</span>
                                    <span className={styles.outletTag}>{formatOutletId(outlet.id)}</span>
                                  </div>
                                  <div className={styles.detailGrid}>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Address</span>
                                      <span className={styles.detailValue}>
                                        {formatDetailValue(outlet.address ?? null)}
                                      </span>
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Maps URL</span>
                                      {outlet.mapsUrl ? (
                                        <a
                                          className={styles.detailLink}
                                          href={outlet.mapsUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          Open Map
                                        </a>
                                      ) : (
                                        <span className={styles.detailValue}>-</span>
                                      )}
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Valid Until</span>
                                      <span className={styles.detailValue}>
                                        {formatDateTime(outlet.validUntil ?? null)}
                                      </span>
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Created At</span>
                                      <span className={styles.detailValue}>
                                        {formatDateTime(outlet.createdAt ?? null)}
                                      </span>
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Updated At</span>
                                      <span className={styles.detailValue}>
                                        {formatDateTime(outlet.updatedAt ?? null)}
                                      </span>
                                    </div>
                                  </div>
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
          <div className={ticketStyles.paginationPerPage}>
            <span className={ticketStyles.paginationLabel}>Rows per page</span>
            <div className={ticketStyles.paginationPerPageOptions}>
              {PER_PAGE_OPTIONS.map((option) =>
                option === perPage ? (
                  <span key={option} className={`${ticketStyles.paginationButton} ${ticketStyles.paginationButtonActive}`}>
                    {option}
                  </span>
                ) : (
                  <button
                    key={option}
                    type="button"
                    className={ticketStyles.paginationButton}
                    onClick={() => handlePerPageChange(option)}
                    disabled={isNavigating}
                  >
                    {option}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className={styles.paginationCenter}>
            <span className={ticketStyles.paginationInfo}>
              Showing {startIndex}-{endIndex} of {totalCount}
            </span>
          </div>
          <div className={ticketStyles.paginationControls}>
            {page > 1 ? (
              <button
                type="button"
                className={ticketStyles.paginationButton}
                onClick={() => navigateTo(page - 1)}
                disabled={isNavigating}
              >
                Previous
              </button>
            ) : (
              <span className={`${ticketStyles.paginationButton} ${ticketStyles.paginationButtonDisabled}`}>Previous</span>
            )}
            <span className={ticketStyles.paginationPageIndicator}>
              Page {page} of {totalPagesSafe}
            </span>
            {page < totalPagesSafe ? (
              <button
                type="button"
                className={ticketStyles.paginationButton}
                onClick={() => navigateTo(page + 1)}
                disabled={isNavigating}
              >
                Next
              </button>
            ) : (
              <span className={`${ticketStyles.paginationButton} ${ticketStyles.paginationButtonDisabled}`}>Next</span>
            )}
          </div>
        </div>
      </section>

      {showImportModal ? (
        <div className={styles.importOverlay} role="status" aria-live="polite">
          <div className={styles.importModal}>
            <div className={styles.spinner} aria-hidden="true" />
            <div className={styles.importModalText}>
              <h3>Importing franchise data</h3>
              <p>
                {importJob?.status === 'running'
                  ? `Processed ${importJob.processedCount} of ${importJob.totalCount ?? '...'}`
                  : 'Starting import...'}
              </p>
              {progressPercent !== null ? <span>{progressPercent}% complete</span> : null}
            </div>
          </div>
        </div>
      ) : null}
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
