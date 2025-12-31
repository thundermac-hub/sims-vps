'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ticketStyles from '../tickets/tickets.module.css';
import RowsPerPageControls from '../tickets/RowsPerPageControls';
import styles from './merchants.module.css';
import pageStyles from './[fid]/franchise.module.css';

type SortKey = 'id' | 'merchant' | 'issue' | 'status' | 'created';
type SortDirection = 'asc' | 'desc';

type SupportRequestTableRow = {
  id: number;
  merchantName: string;
  outletName: string;
  issueType: string;
  status: string;
  createdAtMs: number;
  createdAtLabel: string;
};

interface SupportRequestsTableProps {
  rows: SupportRequestTableRow[];
  totalTickets: number;
}

const STATUS_ORDER = ['Open', 'In Progress', 'Pending Customer', 'Resolved'];
const PER_PAGE_OPTIONS = [5, 10, 20, 40, 80] as const;
const DEFAULT_PER_PAGE = 20;

const compareStrings = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

const compareNumbers = (left: number, right: number): number => left - right;

export default function SupportRequestsTable({ rows, totalTickets }: SupportRequestsTableProps) {
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'created',
    direction: 'desc',
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(
    PER_PAGE_OPTIONS.includes(DEFAULT_PER_PAGE) ? DEFAULT_PER_PAGE : PER_PAGE_OPTIONS[0],
  );

  const handlePerPageChange = (formData: FormData) => {
    const candidate = Number(formData.get('perPage'));
    if (PER_PAGE_OPTIONS.includes(candidate as (typeof PER_PAGE_OPTIONS)[number])) {
      setPerPage(candidate as (typeof PER_PAGE_OPTIONS)[number]);
      setPage(1);
    }
  };

  const outletOptions = useMemo(() => {
    const names = Array.from(
      new Set(rows.map((row) => row.outletName.trim()).filter((name) => name.length > 0)),
    );
    names.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
    return names;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!selectedOutlet) {
      return rows;
    }
    return rows.filter((row) => row.outletName.trim() === selectedOutlet);
  }, [rows, selectedOutlet]);

  const sortedRows = useMemo(() => {
    const next = [...filteredRows];
    next.sort((a, b) => {
      let result = 0;
      switch (sortConfig.key) {
        case 'id':
          result = compareNumbers(a.id, b.id);
          break;
        case 'merchant': {
          const merchantCompare = compareStrings(a.merchantName, b.merchantName);
          result = merchantCompare !== 0 ? merchantCompare : compareStrings(a.outletName, b.outletName);
          break;
        }
        case 'issue':
          result = compareStrings(a.issueType, b.issueType);
          break;
        case 'status': {
          const leftIndex = STATUS_ORDER.indexOf(a.status);
          const rightIndex = STATUS_ORDER.indexOf(b.status);
          const leftOrder = leftIndex === -1 ? STATUS_ORDER.length : leftIndex;
          const rightOrder = rightIndex === -1 ? STATUS_ORDER.length : rightIndex;
          result = compareNumbers(leftOrder, rightOrder);
          break;
        }
        case 'created':
          result = compareNumbers(a.createdAtMs, b.createdAtMs);
          break;
        default:
          result = 0;
      }
      return sortConfig.direction === 'asc' ? result : -result;
    });
    return next;
  }, [filteredRows, sortConfig]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [selectedOutlet]);

  const startIndex = totalRows === 0 ? 0 : (page - 1) * perPage;
  const pageRows = sortedRows.slice(startIndex, startIndex + perPage);
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const displayStart = totalRows === 0 ? 0 : startIndex + 1;
  const displayEnd = totalRows === 0 ? 0 : Math.min(totalRows, startIndex + pageRows.length);

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      const direction = key === 'id' || key === 'created' ? 'desc' : 'asc';
      return { key, direction };
    });
    setPage(1);
  };

  const ariaSort = (key: SortKey) =>
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <>
      <div className={ticketStyles.tableHeader}>
        <div className={pageStyles.ticketHeaderTitle}>
          <h2>Support Tickets</h2>
        </div>
        <label className={pageStyles.ticketFilterLabel}>
          <select
            className={pageStyles.ticketFilterInput}
            value={selectedOutlet}
            onChange={(event) => setSelectedOutlet(event.target.value)}
            aria-label="Filter support requests by outlet name"
          >
            <option value="">All outlets</option>
            {outletOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={ticketStyles.tableWrapper}>
        <table className={`${ticketStyles.table} ${pageStyles.ticketsTable}`}>
          <thead>
            <tr>
              <th aria-sort={ariaSort('id')}>
                <button type="button" className={styles.sortButton} onClick={() => handleSort('id')}>
                  ID
                  <SortIcon active={sortConfig.key === 'id'} direction={sortConfig.direction} />
                </button>
              </th>
              <th aria-sort={ariaSort('merchant')}>
                <button type="button" className={styles.sortButton} onClick={() => handleSort('merchant')}>
                  Merchant / Outlet
                  <SortIcon active={sortConfig.key === 'merchant'} direction={sortConfig.direction} />
                </button>
              </th>
              <th aria-sort={ariaSort('issue')}>
                <button type="button" className={styles.sortButton} onClick={() => handleSort('issue')}>
                  Issue Type
                  <SortIcon active={sortConfig.key === 'issue'} direction={sortConfig.direction} />
                </button>
              </th>
              <th aria-sort={ariaSort('status')}>
                <button type="button" className={styles.sortButton} onClick={() => handleSort('status')}>
                  Status
                  <SortIcon active={sortConfig.key === 'status'} direction={sortConfig.direction} />
                </button>
              </th>
              <th aria-sort={ariaSort('created')}>
                <button type="button" className={styles.sortButton} onClick={() => handleSort('created')}>
                  Created
                  <SortIcon active={sortConfig.key === 'created'} direction={sortConfig.direction} />
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className={ticketStyles.empty}>
                  No support requests found for this franchise.
                </td>
              </tr>
            ) : (
              pageRows.map((ticket) => (
                <tr key={ticket.id}>
                  <td className={pageStyles.ticketId}>#{ticket.id}</td>
                  <td>
                    <span>{ticket.merchantName}</span>
                    <span className={pageStyles.ticketSecondary}>{ticket.outletName}</span>
                  </td>
                  <td>{ticket.issueType}</td>
                  <td>{ticket.status}</td>
                  <td>{ticket.createdAtLabel}</td>
                  <td>
                    <Link className={ticketStyles.viewButton} href={`/merchants/tickets/${ticket.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalRows > 0 ? (
        <div className={ticketStyles.paginationBar}>
          <div className={ticketStyles.paginationPerPage}>
            <span className={ticketStyles.paginationLabel}>Rows per page</span>
            <RowsPerPageControls options={PER_PAGE_OPTIONS} current={perPage} onChange={handlePerPageChange} />
          </div>
          <div className={ticketStyles.paginationInfo}>
            Showing {displayStart}-{displayEnd} of {totalRows}
          </div>
          <div className={ticketStyles.paginationControls}>
            {previousPage ? (
              <button type="button" className={ticketStyles.paginationButton} onClick={() => setPage(previousPage)}>
                Previous
              </button>
            ) : (
              <span className={`${ticketStyles.paginationButton} ${ticketStyles.paginationButtonDisabled}`}>Previous</span>
            )}
            <span className={ticketStyles.paginationPageIndicator}>
              Page {page} of {totalPages}
            </span>
            {nextPage ? (
              <button type="button" className={ticketStyles.paginationButton} onClick={() => setPage(nextPage)}>
                Next
              </button>
            ) : (
              <span className={`${ticketStyles.paginationButton} ${ticketStyles.paginationButtonDisabled}`}>Next</span>
            )}
          </div>
        </div>
      ) : null}
      {selectedOutlet === '' && totalRows < totalTickets ? (
        <p className={pageStyles.ticketsMeta}>
          Showing {totalRows} of {totalTickets} requests. Refine in the tickets view for more.
        </p>
      ) : null}
    </>
  );
}

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
