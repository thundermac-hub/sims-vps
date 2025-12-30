'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ChevronDown, Download, ExternalLink, Minus, Plus, Search } from 'lucide-react';
import ticketStyles from '../tickets/tickets.module.css';
import RowsPerPageControls from '../tickets/RowsPerPageControls';
import PaginationControlButtons from '../tickets/PaginationControlButtons';
import SearchKeywordInput from '../tickets/SearchKeywordInput';
import styles from './merchants.module.css';
import type { FranchiseSummary } from '@/lib/franchise';
import { PER_PAGE_OPTIONS, type SortDirection, type SortKey } from './constants';

interface MerchantsClientProps {
  franchises: FranchiseSummary[];
  canStartImport: boolean;
  totalCount: number;
  totalActiveOutlets: number;
  page: number;
  totalPages: number | null;
  perPage: number;
  initialQuery?: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  dataUnavailable?: boolean;
  onSearch: (formData: FormData) => void | Promise<void>;
  onPerPageChange: (formData: FormData) => void | Promise<void>;
  onPageChange: (formData: FormData) => void | Promise<void>;
  onSortChange: (formData: FormData) => void | Promise<void>;
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type OutletStatusTone = 'active' | 'expiring' | 'expired';

const getOutletStatus = (validUntil: string | null): { label: string; tone: OutletStatusTone } => {
  const date = parseDateTime(validUntil);
  if (!date) {
    return { label: 'Active', tone: 'active' };
  }
  const now = Date.now();
  const diff = date.getTime() - now;
  if (diff < 0) {
    return { label: 'Expired', tone: 'expired' };
  }
  if (diff <= THIRTY_DAYS_MS) {
    return { label: 'Expiring Soon', tone: 'expiring' };
  }
  return { label: 'Active', tone: 'active' };
};

const buildFranchiseLink = (fid: string | null): string | null => {
  const cleaned = (fid ?? '').trim();
  if (!cleaned) {
    return null;
  }
  return `https://cloud.getslurp.com/batcave/franchise/${encodeURIComponent(cleaned)}`;
};

const buildExportHref = (format: 'csv' | 'pdf', sort: SortConfig): string => {
  const params = new URLSearchParams();
  params.set('format', format);
  params.set('sort', sort.key);
  params.set('dir', sort.direction);
  return `/api/merchants/export?${params.toString()}`;
};

export default function MerchantsClient({
  franchises,
  canStartImport,
  totalCount,
  totalActiveOutlets,
  page,
  totalPages,
  perPage,
  initialQuery,
  sortKey,
  sortDirection,
  dataUnavailable,
  onSearch,
  onPerPageChange,
  onPageChange,
  onSortChange,
}: MerchantsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const activeQuery = (initialQuery ?? '').trim();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: sortKey, direction: sortDirection });
  const [importJob, setImportJob] = useState<FranchiseImportJob | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isStartingImport, setIsStartingImport] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const exportMenuRef = useRef<HTMLDetailsElement | null>(null);

  const outletFranchises = useMemo(() => franchises.filter((franchise) => franchise.outlets.length > 0), [franchises]);

  const filtered = outletFranchises;
  const sortedFranchises = filtered;

  const totalPagesSafe = totalPages ?? 1;
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPagesSafe ? page + 1 : null;

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
        ? canStartImport
          ? 'No cached franchise data yet. Run a manual import to load the latest list.'
          : 'No cached franchise data yet. Check back after the next nightly sync.'
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
    setSortConfig({ key: sortKey, direction: sortDirection });
  }, [sortKey, sortDirection]);

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

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      const menu = exportMenuRef.current;
      if (!menu || !menu.open) {
        return;
      }
      if (event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      const menu = exportMenuRef.current;
      if (menu && menu.open) {
        menu.open = false;
      }
    };

    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const startImport = async () => {
    if (!canStartImport) {
      return;
    }
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
    startTransition(() => {
      const formData = new FormData();
      formData.set('intent', 'instant');
      formData.set('sort', nextConfig.key);
      formData.set('dir', nextConfig.direction);
      void (async () => {
        try {
          await onSortChange(formData);
        } catch (error) {
          console.error('Failed to update sort order', error);
        }
        router.refresh();
      })();
    });
  };

  const ariaSort = (key: SortKey) =>
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none';

  const progressPercent =
    importJob && typeof importJob.totalCount === 'number' && importJob.totalCount > 0
      ? Math.min(100, Math.round((importJob.processedCount / importJob.totalCount) * 100))
      : null;
  const showImportModal = isStartingImport || importJob?.status === 'running';
  const exportCsvHref = buildExportHref('csv', sortConfig);
  const exportPdfHref = buildExportHref('pdf', sortConfig);

  return (
    <>
      <div className={ticketStyles.filtersCard}>
        <div className={styles.searchRow}>
          <div className={styles.searchField}>
            <span className={styles.searchIcon} aria-hidden="true">
              <Search size={18} />
            </span>
            <SearchKeywordInput
              className={styles.searchInput}
              type="search"
              defaultValue={initialQuery ?? ''}
              placeholder="Search by franchise, company, FID, or outlet"
              ariaLabel="Search by franchise, company, FID, or outlet"
              debounceMs={400}
              onSearch={onSearch}
            />
          </div>
          <details className={styles.exportMenu} ref={exportMenuRef}>
            <summary className={styles.exportButton} aria-label="Export merchants">
              <span className={styles.exportIcon} aria-hidden="true">
                <Download size={16} />
              </span>
              Export
              <ChevronDown size={14} className={styles.exportCaret} aria-hidden="true" />
            </summary>
            <div className={styles.exportList}>
              <a className={styles.exportItem} href={exportCsvHref}>
                Export as CSV
              </a>
              <a className={styles.exportItem} href={exportPdfHref} target="_blank" rel="noreferrer">
                Export as PDF
              </a>
            </div>
          </details>
          {canStartImport ? (
            <button
              type="button"
              className={styles.importCta}
              onClick={startImport}
              disabled={isStartingImport || importJob?.status === 'running'}
            >
              {importJob?.status === 'running' ? 'Importing...' : 'Import Latest Data'}
            </button>
          ) : null}
        </div>
        {canStartImport && !showImportModal ? (
          <div className={styles.importBar}>
            <div className={styles.importStatus}>
              {importJob ? (
                <span className={styles.importLabel}>
                  {importJob.status === 'completed' ? 'Import complete' : 'Import failed'}
                </span>
              ) : (
                <span className={styles.importLabel}>Use the button to refresh the cached list.</span>
              )}
            </div>
            {importError ? <p className={styles.importError}>{importError}</p> : null}
            {importJob?.status === 'failed' && importJob.errorMessage ? (
              <p className={styles.importError}>{importJob.errorMessage}</p>
            ) : null}
          </div>
        ) : null}
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
        <div className={`${ticketStyles.tableWrapper} ${styles.tableWrapper}`}>
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
                          {fid ? (
                            <Link
                              className={styles.franchiseLink}
                              href={`/merchants/${encodeURIComponent(fid)}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              View Franchise
                            </Link>
                          ) : null}
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
                                {franchise.outlets.map((outlet, outletIndex) => {
                                  const outletStatus = getOutletStatus(outlet.validUntil ?? null);
                                  return (
                                    <div
                                      key={`${fid || name}-outlet-${outlet.id ?? outletIndex}`}
                                      className={styles.outletCard}
                                    >
                                      <div className={styles.outletHeader}>
                                        <div>
                                          <span className={styles.outletName}>{formatOutletName(outlet.name)}</span>
                                          <span className={styles.outletSub}>{formatOutletId(outlet.id)}</span>
                                        </div>
                                        <div className={styles.outletHeaderMeta}>
                                          <span
                                            className={`${styles.outletStatus} ${
                                              outletStatus.tone === 'expired'
                                                ? styles.outletStatusExpired
                                                : outletStatus.tone === 'expiring'
                                                  ? styles.outletStatusExpiring
                                                  : styles.outletStatusActive
                                            }`}
                                          >
                                            {outletStatus.label}
                                          </span>
                                          {outlet.mapsUrl ? (
                                            <a
                                              className={styles.mapLink}
                                              href={outlet.mapsUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                            >
                                              View on Maps
                                              <span className={styles.mapLinkIcon} aria-hidden="true">
                                                <ExternalLink />
                                              </span>
                                            </a>
                                          ) : null}
                                        </div>
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
                                  );
                                })}
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
            <RowsPerPageControls options={PER_PAGE_OPTIONS} current={perPage} onChange={onPerPageChange} />
          </div>
          <div className={ticketStyles.paginationInfo}>
            Showing {startIndex}-{endIndex} of {totalCount}
          </div>
          <PaginationControlButtons
            page={page}
            totalPages={totalPagesSafe}
            previousPage={previousPage}
            nextPage={nextPage}
            onChange={onPageChange}
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
