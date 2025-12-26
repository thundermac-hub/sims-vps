'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Search } from 'lucide-react';
import ticketStyles from '../tickets/tickets.module.css';
import RowsPerPageControls from '../tickets/RowsPerPageControls';
import PaginationControlButtons from '../tickets/PaginationControlButtons';
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
  sortKey: SortKey;
  sortDirection: SortDirection;
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

const buildPageHref = (page: number, query: string, perPage: number, sort: SortConfig): string => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('perPage', String(perPage));
  params.set('sort', sort.key);
  params.set('dir', sort.direction);
  if (query.trim()) {
    params.set('q', query.trim());
  }
  return `?${params.toString()}`;
};

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
const SEARCH_DEBOUNCE_MS = 400;

export default function MerchantsClient({
  franchises,
  totalCount,
  totalActiveOutlets,
  page,
  totalPages,
  perPage,
  initialQuery,
  sortKey,
  sortDirection,
  dataUnavailable,
}: MerchantsClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery ?? '');
  const trimmedQuery = query.trim();
  const activeQuery = (initialQuery ?? '').trim();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: sortKey, direction: sortDirection });
  const [importJob, setImportJob] = useState<FranchiseImportJob | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isStartingImport, setIsStartingImport] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const outletFranchises = useMemo(() => franchises.filter((franchise) => franchise.outlets.length > 0), [franchises]);

  const filtered = outletFranchises;
  const sortedFranchises = filtered;

  const totalPagesSafe = totalPages ?? 1;
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPagesSafe ? page + 1 : null;

  const handlePerPageChange = (formData: FormData) => {
    const perPageCandidate = Number(formData.get('perPage'));
    if (
      !Number.isFinite(perPageCandidate) ||
      !PER_PAGE_OPTIONS.includes(perPageCandidate as (typeof PER_PAGE_OPTIONS)[number])
    ) {
      return;
    }
    const nextPerPage = perPageCandidate;
    const href = buildPageHref(1, query, nextPerPage, sortConfig);
    router.push(href);
  };

  const handlePageChange = (formData: FormData) => {
    const pageCandidate = Number(formData.get('page'));
    if (!Number.isFinite(pageCandidate)) {
      return;
    }
    const nextPageValue = Math.min(Math.max(1, Math.floor(pageCandidate)), totalPagesSafe);
    if (nextPageValue === page) {
      return;
    }
    const href = buildPageHref(nextPageValue, query, perPage, sortConfig);
    router.push(href);
  };

  const visibleOutletCount = useMemo(
    () => sortedFranchises.reduce((total, franchise) => total + franchise.outlets.length, 0),
    [sortedFranchises],
  );

  const startIndex = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const endIndex = totalCount === 0 ? 0 : Math.min(totalCount, page * perPage);
  const activeOutletCount = totalActiveOutlets;

  const emptyMessage = dataUnavailable
    ? 'Unable to load franchise data. Please refresh and try again.'
    : activeQuery
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
    setQuery(initialQuery ?? '');
  }, [initialQuery]);

  useEffect(() => {
    setSortConfig({ key: sortKey, direction: sortDirection });
  }, [sortKey, sortDirection]);

  useEffect(() => {
    if (trimmedQuery === activeQuery) {
      return undefined;
    }
    const handle = setTimeout(() => {
      const href = buildPageHref(1, trimmedQuery, perPage, sortConfig);
      router.push(href);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [trimmedQuery, activeQuery, perPage, sortConfig, router]);

  useEffect(() => {
    setOpenKeys([]);
  }, [franchises]);

  const toggleOpen = (key: string) => {
    setOpenKeys((previous) => (previous.includes(key) ? previous.filter((value) => value !== key) : [...previous, key]));
  };

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

  const handleSort = (key: SortKey) => {
    const nextConfig: SortConfig =
      sortConfig.key === key
        ? { key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'fid' ? 'desc' : 'asc' };
    setSortConfig(nextConfig);
    const href = buildPageHref(page, query, perPage, nextConfig);
    router.push(href);
  };

  const ariaSort = (key: SortKey) =>
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none';

  const progressPercent =
    importJob && typeof importJob.totalCount === 'number' && importJob.totalCount > 0
      ? Math.min(100, Math.round((importJob.processedCount / importJob.totalCount) * 100))
      : null;
  const showImportModal = isStartingImport || importJob?.status === 'running';

  return (
    <>
      <div className={ticketStyles.filtersCard}>
        <div className={styles.searchRow}>
          <div className={styles.searchField}>
            <span className={styles.searchIcon} aria-hidden="true">
              <Search size={18} />
            </span>
            <input
              className={styles.searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by franchise, FID, or outlet"
              type="search"
              aria-label="Search by franchise, FID, or outlet"
            />
          </div>
          <button
            type="button"
            className={styles.importCta}
            onClick={startImport}
            disabled={isStartingImport || importJob?.status === 'running'}
          >
            {importJob?.status === 'running' ? 'Importing...' : 'Import Latest Data'}
          </button>
        </div>
        <div className={styles.importBar}>
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
          <table className={`${ticketStyles.table} ${styles.merchantsTable}`}>
            <thead>
              <tr>
                <th aria-sort={ariaSort('fid')}>
                  <button type="button" className={styles.sortButton} onClick={() => handleSort('fid')}>
                    FID
                    <SortIcon active={sortConfig.key === 'fid'} direction={sortConfig.direction} />
                  </button>
                </th>
                <th aria-sort={ariaSort('franchise')}>
                  <button type="button" className={styles.sortButton} onClick={() => handleSort('franchise')}>
                    Franchise
                    <SortIcon active={sortConfig.key === 'franchise'} direction={sortConfig.direction} />
                  </button>
                </th>
                <th aria-sort={ariaSort('outlets')}>
                  <button type="button" className={styles.sortButton} onClick={() => handleSort('outlets')}>
                    Outlets
                    <SortIcon active={sortConfig.key === 'outlets'} direction={sortConfig.direction} />
                  </button>
                </th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {sortedFranchises.length === 0 ? (
                <tr>
                  <td colSpan={4} className={ticketStyles.empty}>
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                sortedFranchises.map((franchise, index) => {
                  const fid = franchise.fid ?? '';
                  const name = formatFranchiseName(franchise.name, franchise.fid);
                  const key = fid || name ? `${fid}-${name}` : `franchise-${index}`;
                  const franchiseLink = buildFranchiseLink(franchise.fid);
                  const isOpen = openKeys.includes(key);
                  const rowId = `franchise-${index}`;
                  return (
                    <Fragment key={key}>
                      <tr
                        className={`${styles.tableRow} ${isOpen ? styles.tableRowExpanded : ''}`}
                        onClick={() => toggleOpen(key)}
                      >
                        <td className={styles.fidCell}>
                          {franchiseLink && fid ? (
                            <a className={styles.fidLink} href={franchiseLink} target="_blank" rel="noreferrer">
                              {fid}
                            </a>
                          ) : (
                            <span>{fid || '-'}</span>
                          )}
                        </td>
                        <td className={styles.franchiseMainCell}>
                          <span className={styles.franchiseTitle}>{name}</span>
                        </td>
                        <td className={styles.outletCountCell}>
                          <span className={styles.outletCountBadge}>{franchise.outlets.length}</span>
                        </td>
                        <td className={styles.expandCell}>
                          <button
                            type="button"
                            className={styles.expandButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleOpen(key);
                            }}
                            aria-label={isOpen ? 'Collapse franchise details' : 'Expand franchise details'}
                            aria-expanded={isOpen}
                            aria-controls={rowId}
                          >
                            {isOpen ? (
                              <Minus className={styles.expandIcon} size={16} aria-hidden="true" />
                            ) : (
                              <Plus className={styles.expandIcon} size={16} aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className={`${styles.detailRow} ${styles.detailRowExpanded}`} id={rowId}>
                          <td colSpan={4} className={styles.detailCell}>
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
                            </div>
                            <div className={styles.detailDivider} aria-hidden="true" />
                            <div className={styles.outletSection}>
                              <h4 className={styles.outletSectionTitle}>Outlets</h4>
                              <div className={styles.outletCards}>
                                {franchise.outlets.map((outlet, outletIndex) => (
                                  <div
                                    key={`${fid || name}-outlet-${outlet.id ?? outletIndex}`}
                                    className={styles.outletCard}
                                  >
                                    <div className={styles.outletHeader}>
                                      <div>
                                        <span className={styles.outletName}>{formatOutletName(outlet.name)}</span>
                                        <span className={styles.outletSub}>{formatOutletId(outlet.id)}</span>
                                      </div>
                                      {outlet.mapsUrl ? (
                                        <a
                                          className={styles.mapLink}
                                          href={outlet.mapsUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          View on Maps
                                        </a>
                                      ) : null}
                                    </div>
                                    <div className={styles.detailGrid}>
                                      <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>Address</span>
                                        <span className={styles.detailValue}>
                                          {formatDetailValue(outlet.address ?? null)}
                                        </span>
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
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className={ticketStyles.paginationBar}>
          <div className={ticketStyles.paginationPerPage}>
            <span className={ticketStyles.paginationLabel}>Rows per page</span>
            <RowsPerPageControls options={PER_PAGE_OPTIONS} current={perPage} onChange={handlePerPageChange} />
          </div>
          <div className={ticketStyles.paginationInfo}>
            Showing {startIndex}-{endIndex} of {totalCount}
          </div>
          <PaginationControlButtons
            page={page}
            totalPages={totalPagesSafe}
            previousPage={previousPage}
            nextPage={nextPage}
            onChange={handlePageChange}
          />
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

type SortDirection = 'asc' | 'desc';
type SortKey = 'fid' | 'franchise' | 'outlets';
type SortConfig = { key: SortKey; direction: SortDirection };

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <span className={styles.sortIcon} aria-hidden="true">
      <svg viewBox="0 0 16 16" role="presentation">
        <path
          className={active && direction === 'asc' ? styles.sortArrowActive : styles.sortArrow}
          d="M8 3l3 3H5l3-3Z"
        />
        <path
          className={active && direction === 'desc' ? styles.sortArrowActive : styles.sortArrow}
          d="M8 13l-3-3h6l-3 3Z"
        />
      </svg>
    </span>
  );
}
