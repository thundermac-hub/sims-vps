import { redirect } from 'next/navigation';
import ticketsStyles from '../tickets/tickets.module.css';
import styles from './audit-trail.module.css';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canManageSupportSettings } from '@/lib/branding';
import {
  fetchRequestByIdWithSignedUrl,
  fetchSupportRequestHistoryPage,
  getSupportRequestHistory,
  type SupportRequestHistoryRow,
  type SupportRequestWithAttachment,
} from '@/lib/requests';
import { listUsers } from '@/lib/users';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type AuditTrailSearchParams = {
  ticketId?: string | string[];
  page?: string | string[];
  perPage?: string | string[];
};

const MAX_AUDIT_RECORDS = 500;
const AUDIT_PER_PAGE_OPTIONS = [5, 10, 20, 40, 80] as const;
const DEFAULT_AUDIT_PER_PAGE = 20;

const HISTORY_FIELD_LABELS: Record<string, string> = {
  merchant_name: 'Merchant Name',
  outlet_name: 'Outlet Name',
  phone_number: 'Phone Number',
  email: 'Email',
  fid: 'FID',
  oid: 'OID',
  issue_type: 'Issue Type',
  issue_subcategory1: 'Issue Subcategory 1',
  issue_subcategory2: 'Issue Subcategory 2',
  issue_description: 'Issue Description',
  ticket_description: 'Ticket Description',
  status: 'Status',
  clickup_link: 'ClickUp Link',
  clickup_task_id: 'ClickUp Task ID',
  clickup_task_status: 'ClickUp Status',
  ms_pic_user_id: 'Assigned MS PIC',
  franchise_name_resolved: 'Franchise',
  outlet_name_resolved: 'Outlet',
  hidden: 'Archived',
};

function formatHistoryField(field: string): string {
  if (HISTORY_FIELD_LABELS[field]) {
    return HISTORY_FIELD_LABELS[field];
  }
  const spaced = field.replace(/_/g, ' ').trim();
  if (!spaced) return field;
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatHistoryUser(identifier: string | null, userDisplayById: Map<string, string>): string {
  if (!identifier) {
    return 'Unknown user';
  }
  const mapped = userDisplayById.get(String(identifier));
  if (mapped) {
    return mapped;
  }
  const trimmed = identifier.trim();
  if (!trimmed) {
    return 'Unknown user';
  }
  if (trimmed.includes('@')) {
    const [localPart] = trimmed.split('@');
    const words = localPart.replace(/[\.\-_]+/g, ' ').split(' ').filter(Boolean);
    if (words.length > 0) {
      return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
  }
  return 'Unknown user';
}

function formatHistoryValue(field: string, value: string | null, userDisplayById: Map<string, string>): string {
  if (field === 'ms_pic_user_id') {
    if (!value) return '-';
    const mapped = userDisplayById.get(String(value));
    if (mapped) return mapped;
    const fallback = formatHistoryUser(value, userDisplayById);
    return fallback === 'Unknown user' ? '-' : fallback;
  }
  if (field === 'hidden') {
    if (value === 'true') return 'Archived';
    if (value === 'false') return 'Active';
  }
  return value ?? '-';
}

function normaliseSearchValue(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? '';
  }
  return value.trim();
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const whole = Math.floor(parsed);
  return whole > 0 ? whole : null;
}

function buildAllRecordsHref(page: number, perPage: number): string {
  const params = new URLSearchParams();
  if (page > 1) {
    params.set('page', String(page));
  }
  if (perPage !== DEFAULT_AUDIT_PER_PAGE) {
    params.set('perPage', String(perPage));
  }
  const query = params.toString();
  return query ? `/audit-trail?${query}` : '/audit-trail';
}

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams?: Promise<AuditTrailSearchParams> | AuditTrailSearchParams;
}) {
  const authUser = await getAuthenticatedUser();
  if (!canManageSupportSettings(authUser.department, authUser.role, authUser.isSuperAdmin)) {
    redirect('/profile');
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const ticketIdInput = normaliseSearchValue(resolvedSearchParams?.ticketId);
  const hasTicketId = ticketIdInput.length > 0;
  const parsedTicketId = Number(ticketIdInput);
  const isValidTicketId = Number.isFinite(parsedTicketId) && parsedTicketId > 0;
  const pageInput = normaliseSearchValue(resolvedSearchParams?.page);
  const parsedPage = parsePositiveInt(pageInput);
  const perPageInput = normaliseSearchValue(resolvedSearchParams?.perPage);
  const parsedPerPage = parsePositiveInt(perPageInput);
  const perPage = AUDIT_PER_PAGE_OPTIONS.includes(parsedPerPage as (typeof AUDIT_PER_PAGE_OPTIONS)[number])
    ? (parsedPerPage as (typeof AUDIT_PER_PAGE_OPTIONS)[number])
    : DEFAULT_AUDIT_PER_PAGE;
  const maxPages = Math.max(1, Math.ceil(MAX_AUDIT_RECORDS / perPage));
  let page = parsedPage ?? 1;
  page = Math.min(page, maxPages);

  let history: SupportRequestHistoryRow[] = [];
  let request: SupportRequestWithAttachment | null = null;
  let loadError: string | null = null;
  let userDisplayById = new Map<string, string>();
  const isAllRecordsView = !hasTicketId;
  let totalCount = 0;
  let totalPages = 1;
  let startIndex = 0;
  let endIndex = 0;

  if (hasTicketId && isValidTicketId) {
    try {
      const [historyRows, requestRow] = await Promise.all([
        getSupportRequestHistory(parsedTicketId),
        fetchRequestByIdWithSignedUrl(parsedTicketId),
      ]);
      history = historyRows;
      request = requestRow;

      if (!requestRow) {
        loadError = `Ticket #${parsedTicketId} was not found.`;
        history = [];
      } else if (historyRows.length > 0) {
        try {
          const users = await listUsers();
          userDisplayById = new Map(
            users.map((user) => {
              const label = user.name?.trim() || user.email || `User #${user.id}`;
              return [String(user.id), label];
            }),
          );
        } catch (error) {
          console.warn('Failed to load user directory for audit trail', error);
        }
      }
    } catch (error) {
      console.error('Failed to load audit trail', error);
      loadError = 'Unable to load audit trail right now.';
    }
  } else if (isAllRecordsView) {
    try {
      let offset = (page - 1) * perPage;
      let pageResult = await fetchSupportRequestHistoryPage(perPage, offset);
      totalCount = Math.min(pageResult.count, MAX_AUDIT_RECORDS);
      totalPages = Math.max(1, Math.ceil(totalCount / perPage));
      if (totalCount > 0 && page > totalPages) {
        page = totalPages;
        offset = (page - 1) * perPage;
        pageResult = await fetchSupportRequestHistoryPage(perPage, offset);
      }
      history = pageResult.rows;
      startIndex = totalCount === 0 ? 0 : offset + 1;
      endIndex = totalCount === 0 ? 0 : Math.min(offset + history.length, totalCount);
      if (history.length > 0) {
        try {
          const users = await listUsers();
          userDisplayById = new Map(
            users.map((user) => {
              const label = user.name?.trim() || user.email || `User #${user.id}`;
              return [String(user.id), label];
            }),
          );
        } catch (error) {
          console.warn('Failed to load user directory for audit trail', error);
        }
      }
    } catch (error) {
      console.error('Failed to load audit trail', error);
      loadError = 'Unable to load audit trail right now.';
    }
  }

  const historyFormatter = new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: env.timezone,
  });
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  return (
    <div className={ticketsStyles.page}>
      <section className={ticketsStyles.hero}>
        <div className={ticketsStyles.heroTop}>
          <div>
            <h1 className={ticketsStyles.heroTitle}>Audit Trail</h1>
            <p className={ticketsStyles.heroSubtitle}>
              Review field changes made to support requests. Search by ticket ID to see who updated what and when.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.searchCard}>
        <div className={styles.searchHeader}>
          <h2 className={styles.searchTitle}>Find a support request</h2>
          <p className={styles.searchSubtitle}>Enter the ticket ID from the Tickets page.</p>
        </div>
        <form className={styles.searchForm} method="get" action="/audit-trail">
          <label className={styles.searchLabel}>
            Ticket ID
            <input
              className={styles.searchInput}
              type="number"
              name="ticketId"
              min="1"
              inputMode="numeric"
              defaultValue={ticketIdInput}
              placeholder="e.g. 1024"
            />
          </label>
          <button type="submit" className={styles.searchButton}>
            View Audit Trail
          </button>
        </form>
      </section>

      <section className={styles.resultsCard}>
        {!hasTicketId ? (
          loadError ? (
            <p className={styles.errorNotice}>{loadError}</p>
          ) : (
            <>
              <div className={styles.resultsHeader}>
                <div>
                  <p className={styles.resultsKicker}>Support Requests</p>
                  <h2 className={styles.resultsTitle}>All Audit Entries</h2>
                  <p className={styles.resultsSubtitle}>
                    Showing the latest changes across support requests (up to {MAX_AUDIT_RECORDS}).
                  </p>
                </div>
                <span className={styles.statusBadge}>All</span>
              </div>
              <div className={styles.historySection}>
                <div className={styles.historyHeader}>
                  <h3 className={styles.historyTitle}>Change log</h3>
                  <span className={styles.historyCount}>{totalCount} entries</span>
                </div>
                {history.length === 0 ? (
                  <p className={styles.emptyState}>No audit entries recorded yet.</p>
                ) : (
                  <ul className={styles.historyList}>
                    {history.map((entry) => (
                      <li key={entry.id} className={styles.historyItem}>
                        <div className={styles.historyLine}>
                          <span className={styles.historyField}>{formatHistoryField(entry.field_name)}</span>
                          <span className={styles.historyWhen}>{historyFormatter.format(new Date(entry.changed_at))}</span>
                        </div>
                        <div className={styles.historyTicket}>Ticket #{entry.request_id}</div>
                        <div className={styles.historyValues}>
                          <span className={styles.historyLabel}>From</span>
                          <span className={styles.historyValue}>
                            {formatHistoryValue(entry.field_name, entry.old_value, userDisplayById)}
                          </span>
                          <span className={styles.historyLabel}>To</span>
                          <span className={styles.historyValue}>
                            {formatHistoryValue(entry.field_name, entry.new_value, userDisplayById)}
                          </span>
                        </div>
                        <div className={styles.historyBy}>
                          Changed by: {formatHistoryUser(entry.changed_by, userDisplayById)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={ticketsStyles.paginationBar}>
                  <div className={ticketsStyles.paginationPerPage}>
                    <span className={ticketsStyles.paginationLabel}>Rows per page</span>
                    <div className={ticketsStyles.paginationPerPageOptions}>
                      {AUDIT_PER_PAGE_OPTIONS.map((option) =>
                        option === perPage ? (
                          <span key={option} className={`${ticketsStyles.paginationButton} ${ticketsStyles.paginationButtonActive}`}>
                            {option}
                          </span>
                        ) : (
                          <a
                            key={option}
                            className={ticketsStyles.paginationButton}
                            href={buildAllRecordsHref(1, option)}
                          >
                            {option}
                          </a>
                        ),
                      )}
                    </div>
                  </div>
                  <div className={ticketsStyles.paginationInfo}>
                    Showing {startIndex}-{endIndex} of {totalCount}
                  </div>
                  <div className={ticketsStyles.paginationControls}>
                    {prevPage ? (
                      <a className={ticketsStyles.paginationButton} href={buildAllRecordsHref(prevPage, perPage)}>
                        Previous
                      </a>
                    ) : (
                      <span className={`${ticketsStyles.paginationButton} ${ticketsStyles.paginationButtonDisabled}`}>Previous</span>
                    )}
                    <span className={ticketsStyles.paginationPageIndicator}>
                      Page {page} of {totalPages}
                    </span>
                    {nextPage ? (
                      <a className={ticketsStyles.paginationButton} href={buildAllRecordsHref(nextPage, perPage)}>
                        Next
                      </a>
                    ) : (
                      <span className={`${ticketsStyles.paginationButton} ${ticketsStyles.paginationButtonDisabled}`}>Next</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )
        ) : !isValidTicketId ? (
          <p className={styles.errorNotice}>Ticket ID must be a positive number.</p>
        ) : loadError ? (
          <p className={styles.errorNotice}>{loadError}</p>
        ) : request ? (
          <>
            <div className={styles.resultsHeader}>
              <div>
                <p className={styles.resultsKicker}>Support Request</p>
                <h2 className={styles.resultsTitle}>Ticket #{request.id}</h2>
                <p className={styles.resultsSubtitle}>
                  {request.merchant_name || 'N/A'} - {request.outlet_name || 'N/A'}
                </p>
              </div>
              <span className={styles.statusBadge}>{request.status}</span>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Issue Type</span>
                <span className={styles.summaryValue}>{request.issue_type || 'N/A'}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Created</span>
                <span className={styles.summaryValue}>{historyFormatter.format(request.created_at)}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Updated</span>
                <span className={styles.summaryValue}>{historyFormatter.format(request.updated_at)}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Request Status</span>
                <span className={styles.summaryValue}>{request.status}</span>
              </div>
            </div>
            <div className={styles.historySection}>
              <div className={styles.historyHeader}>
                <h3 className={styles.historyTitle}>Change log</h3>
                <span className={styles.historyCount}>{history.length} entries</span>
              </div>
              {history.length === 0 ? (
                <p className={styles.emptyState}>No history recorded for this ticket yet.</p>
              ) : (
                <ul className={styles.historyList}>
                  {history.map((entry) => (
                    <li key={entry.id} className={styles.historyItem}>
                      <div className={styles.historyLine}>
                        <span className={styles.historyField}>{formatHistoryField(entry.field_name)}</span>
                        <span className={styles.historyWhen}>{historyFormatter.format(new Date(entry.changed_at))}</span>
                      </div>
                      <div className={styles.historyTicket}>Ticket #{entry.request_id}</div>
                      <div className={styles.historyValues}>
                        <span className={styles.historyLabel}>From</span>
                        <span className={styles.historyValue}>
                          {formatHistoryValue(entry.field_name, entry.old_value, userDisplayById)}
                        </span>
                        <span className={styles.historyLabel}>To</span>
                        <span className={styles.historyValue}>
                          {formatHistoryValue(entry.field_name, entry.new_value, userDisplayById)}
                        </span>
                      </div>
                      <div className={styles.historyBy}>
                        Changed by: {formatHistoryUser(entry.changed_by, userDisplayById)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
