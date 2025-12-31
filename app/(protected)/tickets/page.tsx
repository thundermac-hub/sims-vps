import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import styles from './tickets.module.css';
import TicketsAutoRefresh from './TicketsAutoRefresh';
import SearchKeywordInput from './SearchKeywordInput';
import StatusFilterSelect from './StatusFilterSelect';
import DateRangePicker from './DateRangePicker';
import RowsPerPageControls from './RowsPerPageControls';
import PaginationControlButtons from './PaginationControlButtons';
import TicketsTable from './TicketsTable';
import { RequestFilters, fetchRequestsWithSignedUrls, storeFranchiseOutletResolution } from '@/lib/requests';
import { env } from '@/lib/env';
import { fetchFranchiseOutlet, type FranchiseLookupResult } from '@/lib/franchise';
import { listMerchantSuccessUsers, listUsers, isPrivilegedRole } from '@/lib/users';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages } from '@/lib/branding';
import ClickUpFilterSelect from './ClickUpFilterSelect';
import ArchivedFilterSelect from './ArchivedFilterSelect';
import { DATE_RANGE_COOKIE, TICKETS_VIEW_COOKIE } from '@/lib/preferences';
import { DEFAULT_SUPPORT_FORM_SETTINGS, getSupportFormSettings } from '@/lib/support-settings';
import { fetchLatestCsatLinks, type CsatLinkInfo } from '@/lib/csat';
import {
  applyFiltersAction,
  attendTicketAction,
  changePageAction,
  changePerPageAction,
  createClickUpTaskAction,
  linkClickUpTaskAction,
  refreshClickUpStatusAction,
  resetFiltersAction,
  unlinkClickUpTaskAction,
  updateTicketAction,
  archiveTicketFormAction,
  markCsatWhatsappSentAction,
} from './actions';
import {
  CLICKUP_ENABLED,
  NO_OUTLET_FOUND,
  PER_PAGE_OPTIONS,
  SEARCH_FETCH_LIMIT,
  STATUS_OPTIONS,
} from './constants';
import { parseViewState } from './view-state';
import { cleanId, formatDate, formatUserDisplayName, isMerchantSuccessUser, resolveUserDisplay } from './utils';
export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  const authUser = await getAuthenticatedUser();
  if (!canAccessSupportPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }
  const isMsUser = isMerchantSuccessUser(authUser.department, authUser.isSuperAdmin);
  const canHideTicket = authUser.isSuperAdmin || isPrivilegedRole(authUser.role);
  const cookieStore = await cookies();
  const viewState = parseViewState(cookieStore.get(TICKETS_VIEW_COOKIE)?.value);
  const perPage = viewState.perPage;
  let page = Math.max(1, viewState.page);
  const [msPicUsers, allUsers] = await Promise.all([
    listMerchantSuccessUsers({ includeInactive: false }),
    listUsers(),
  ]);
  const msPicOptions = msPicUsers.map((user) => {
    const label = user.name?.trim() || formatUserDisplayName(user.email) || user.email || `User #${user.id}`;
    return { id: user.id, label };
  });
  const msPicLabelById = new Map(msPicOptions.map((option) => [option.id, option.label]));
  const userDisplayById = new Map(
    allUsers.map((user) => {
      const label = user.name?.trim() || formatUserDisplayName(user.email) || user.email || `User #${user.id}`;
      return [String(user.id), label];
    }),
  );

  let from: string | undefined;
  let to: string | undefined;
  const savedRange = cookieStore.get(DATE_RANGE_COOKIE)?.value;
  if (savedRange) {
    const [savedFrom = '', savedTo = ''] = savedRange.split('|');
    if (savedFrom) {
      from = savedFrom;
    }
    if (savedTo || savedFrom) {
      to = savedTo || savedFrom;
    }
  }

  const archivedFilter = canHideTicket ? viewState.archivedFilter : 'active';

  const filters: RequestFilters = {
    query: viewState.query ?? undefined,
    status: viewState.status ?? undefined,
    from,
    to,
    hasClickUp: viewState.hasClickUp ?? undefined,
    includeArchived: archivedFilter !== 'active' ? true : undefined,
    archivedOnly: archivedFilter === 'archived' ? true : undefined,
  };

  const hasQuery = Boolean(filters.query && filters.query.trim().length > 0);
  const effectiveFilters: RequestFilters = hasQuery ? { ...filters, query: undefined } : filters;

  let requests: Awaited<ReturnType<typeof fetchRequestsWithSignedUrls>>['rows'] = [];
  let resolvedTotal = 0;
  let totalPages = 1;
  let startIndex = 0;
  let endIndex = 0;
  let previousPage: number | null = null;
  let nextPage: number | null = null;
  let exportHref = '/api/admin/export';
  let csatLinks: Map<number, CsatLinkInfo> = new Map();
  let supportFormSettings!: Awaited<ReturnType<typeof getSupportFormSettings>>;
  let dataLoadFailed = false;
  const franchiseLookupByRequestId = new Map<number, FranchiseLookupResult | null>();

  try {
    let offset = (page - 1) * perPage;
    let rowsResult: Awaited<ReturnType<typeof fetchRequestsWithSignedUrls>> = { rows: [], count: null };
    try {
      rowsResult = await fetchRequestsWithSignedUrls(effectiveFilters, {
        limit: hasQuery ? SEARCH_FETCH_LIMIT : perPage,
        offset: hasQuery ? 0 : offset,
        withCount: hasQuery ? false : true,
      });
    } catch (error) {
      dataLoadFailed = true;
      console.warn('Failed to load ticket data', error);
    }
    let { rows, count } = rowsResult;
    requests = rows;

    const franchiseLookupCache = new Map<string, FranchiseLookupResult | null>();
    const franchiseStoreTasks: Promise<void>[] = [];
    await Promise.all(
      requests.map(async (request) => {
        const fid = cleanId(request.fid);
        const oid = cleanId(request.oid);
        if (!fid || !oid) {
          return;
        }
        const cacheKey = `${fid}-${oid}`;
        const existingFranchise = request.franchise_name_resolved?.trim() || null;
        const existingOutlet = request.outlet_name_resolved?.trim() || null;
        if (existingFranchise || existingOutlet) {
          const lookup: FranchiseLookupResult = {
            franchiseName: existingFranchise,
            outletName: existingOutlet,
            found: true,
          };
          franchiseLookupCache.set(cacheKey, lookup);
          franchiseLookupByRequestId.set(request.id, lookup);
          return;
        }
        if (franchiseLookupCache.has(cacheKey)) {
          const cached = franchiseLookupCache.get(cacheKey);
          franchiseLookupByRequestId.set(request.id, cached ?? null);
          return;
        }

        const lookup = await fetchFranchiseOutlet(fid, oid);
        franchiseLookupCache.set(cacheKey, lookup);
        franchiseLookupByRequestId.set(request.id, lookup ?? null);
        if (lookup && lookup.found && (lookup.franchiseName || lookup.outletName)) {
          franchiseStoreTasks.push(
            storeFranchiseOutletResolution(request.id, lookup.franchiseName ?? null, lookup.outletName ?? null).catch(
              (error) => {
                console.warn('Failed to store franchise lookup', request.id, error);
              },
            ),
          );
        }
      }),
    );
    if (franchiseStoreTasks.length > 0) {
      await Promise.all(franchiseStoreTasks);
    }

    const applyQueryFilter = (
      request: (typeof requests)[number],
      franchiseLookup: FranchiseLookupResult | null,
      query: string,
    ) => {
      const q = query.toLowerCase();
      const values: (string | null | undefined)[] = [
        String(request.id),
        `#${request.id}`,
        request.merchant_name,
        request.outlet_name,
        request.phone_number,
        request.email,
        request.fid,
        request.oid,
        request.issue_type,
        request.issue_description,
        request.issue_subcategory1,
        request.issue_subcategory2,
        franchiseLookup?.franchiseName ?? null,
        franchiseLookup?.outletName ?? null,
      ];
      return values.some((value) => value && value.toLowerCase().includes(q));
    };

    if (hasQuery && filters.query) {
      const filteredRequests = requests.filter((request) =>
        applyQueryFilter(request, franchiseLookupByRequestId.get(request.id) ?? null, filters.query!),
      );
      resolvedTotal = filteredRequests.length;
      totalPages = Math.max(1, Math.ceil(resolvedTotal / perPage));
      page = Math.min(Math.max(page, 1), totalPages);
      const start = resolvedTotal === 0 ? 0 : (page - 1) * perPage;
      const end = resolvedTotal === 0 ? 0 : start + perPage;
      requests = resolvedTotal === 0 ? [] : filteredRequests.slice(start, end);
      startIndex = resolvedTotal === 0 ? 0 : start + 1;
      endIndex = resolvedTotal === 0 ? 0 : start + requests.length;
      previousPage = page > 1 ? page - 1 : null;
      nextPage = page < totalPages ? page + 1 : null;
    } else {
      resolvedTotal = typeof count === 'number' ? count : requests.length + offset;
      totalPages = Math.max(1, Math.ceil(resolvedTotal / perPage));

      if (page > totalPages && resolvedTotal > 0) {
        page = totalPages;
        offset = (page - 1) * perPage;
        try {
          ({ rows, count } = await fetchRequestsWithSignedUrls(filters, {
            limit: perPage,
            offset,
            withCount: true,
          }));
          requests = rows;
          resolvedTotal = typeof count === 'number' ? count : requests.length + offset;
          totalPages = Math.max(1, Math.ceil(resolvedTotal / perPage));
        } catch (error) {
          dataLoadFailed = true;
          console.warn('Failed to reload ticket page after bounds adjust', error);
          requests = [];
          resolvedTotal = 0;
          totalPages = 1;
        }
      }

      startIndex = resolvedTotal === 0 ? 0 : offset + 1;
      endIndex = resolvedTotal === 0 ? 0 : offset + requests.length;
      previousPage = page > 1 ? page - 1 : null;
      nextPage = page < totalPages ? page + 1 : null;
    }

    const exportParams = new URLSearchParams();
    if (filters.query) exportParams.set('q', filters.query);
    if (filters.status) exportParams.set('status', filters.status);
    if (filters.from) exportParams.set('from', filters.from);
    if (filters.to) exportParams.set('to', filters.to);
    if (filters.hasClickUp === true) exportParams.set('clickup', 'with');
    if (filters.hasClickUp === false) exportParams.set('clickup', 'without');
    if (archivedFilter === 'archived') exportParams.set('archived', 'only');
    if (archivedFilter === 'all') exportParams.set('archived', 'all');
    exportHref = `/api/admin/export${exportParams.toString() ? `?${exportParams.toString()}` : ''}`;

    try {
      csatLinks = await fetchLatestCsatLinks(requests.map((request) => request.id));
    } catch (error) {
      console.warn('Failed to load CSAT links', error);
      csatLinks = new Map();
    }
    try {
      supportFormSettings = await getSupportFormSettings();
    } catch (settingsError) {
      console.warn('Failed to load support form settings, using defaults', settingsError);
      supportFormSettings = DEFAULT_SUPPORT_FORM_SETTINGS;
    }
  } catch (error) {
    console.error('Failed to load tickets view', error);
    return (
      <div className={styles.page}>
        <TicketsAutoRefresh interval={30000} />
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <div>
              <h1 className={styles.heroTitle}>Support Tickets</h1>
              <p className={styles.heroSubtitle}>
                We could not refresh ticket data right now. Please check your connection and reload the page.
              </p>
            </div>
          </div>
        </section>
        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2>Tickets</h2>
            <span>Data unavailable</span>
          </div>
          <div className={styles.tableWrapper}>
            <div className={styles.empty}>Unable to load tickets. Try refreshing this page.</div>
          </div>
        </section>
      </div>
    );
  }

  const formatDuration = (start: Date, end: Date): string => {
    const diff = Math.max(0, end.getTime() - start.getTime());
    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(' ');
  };

  const ticketRows = requests.map((request) => {
    const phoneDigits = request.phone_number.replace(/\D/g, '');
    const signedBy =
      authUser.id && userDisplayById.get(String(authUser.id))
        ? userDisplayById.get(String(authUser.id))!
        : authUser.name || 'Slurp Merchant Success';

    const messageTemplate = [
      `Ticket ID: ${request.id}`,
      '',
      `Hi ${request.merchant_name},`,
      '',
      'Thanks for your patience. I’m looking into your issue now:',
      [request.issue_type, request.issue_subcategory1, request.issue_subcategory2].filter(Boolean).join(' · '),
      '',
      'If you have any extra details or questions, just reply here. ✨',
      '',
      'Best regards,',
      signedBy,
      'Slurp Merchant Success Team',
    ]
      .filter((line) => line !== null && line !== undefined)
      .join('\n');
    const whatsappHref = `https://api.whatsapp.com/send/?phone=${encodeURIComponent(phoneDigits)}&text=${encodeURIComponent(messageTemplate)}`;
    const fidHref = request.fid
      ? `https://cloud.getslurp.com/batcave/franchise/${encodeURIComponent(request.fid)}`
      : null;

    const updatedByIdRaw = request.updated_by ?? null;
    const updatedByDisplay = resolveUserDisplay(updatedByIdRaw, userDisplayById);
    const franchiseLookup = franchiseLookupByRequestId.get(request.id) ?? null;
    const dbFranchise = request.franchise_name_resolved?.trim() || null;
    const dbOutletResolved = request.outlet_name_resolved?.trim() || null;
    const franchiseDisplay =
      dbFranchise ??
      (franchiseLookup && franchiseLookup.found ? franchiseLookup.franchiseName ?? null : null);
    const outletDisplay =
      dbOutletResolved ??
      (franchiseLookup && franchiseLookup.found ? franchiseLookup.outletName ?? null : null) ??
      request.outlet_name ??
      null;
    const finalFranchise = franchiseDisplay ?? NO_OUTLET_FOUND;
    const finalOutlet = outletDisplay ?? NO_OUTLET_FOUND;
    const csat = csatLinks.get(request.id) ?? null;

    const ticketPayload = {
      id: request.id,
      merchantName: request.merchant_name,
      outletName: request.outlet_name,
      phoneNumber: request.phone_number,
      email: request.email,
      fid: request.fid,
      oid: request.oid,
      issueType: request.issue_type,
      issueSubcategory1: request.issue_subcategory1,
      issueSubcategory2: request.issue_subcategory2,
      issueDescription: request.issue_description,
      ticketDescription: request.ticket_description ?? '',
      clickupLink: request.clickup_link,
      clickupStatus: request.clickup_task_status,
      attachmentDownloadUrls: request.attachmentDownloadUrls ?? [],
      status: request.status,
      createdAt: request.created_at.toISOString(),
      closedAt: request.closed_at ? request.closed_at.toISOString() : null,
      updatedAt: request.updated_at.toISOString(),
      updatedByName: updatedByDisplay ?? null,
      msPicUserId: request.ms_pic_user_id ?? null,
      msPicDisplayName:
        request.ms_pic_user_id != null
          ? msPicLabelById.get(request.ms_pic_user_id) ?? `User #${request.ms_pic_user_id}`
          : null,
      msPicOptions,
      franchiseResolved: franchiseDisplay ?? null,
      outletResolved: outletDisplay ?? null,
      categoryOptions: supportFormSettings.categoryOptions,
      userDisplayById,
      csatToken: csat?.token ?? null,
      csatExpiresAt: csat?.expiresAt.toISOString() ?? null,
      csatSubmittedAt: csat?.submittedAt ? csat.submittedAt.toISOString() : null,
      csatIsExpired: csat?.isExpired ?? false,
      hidden: request.hidden ?? false,
    };

    const issueSubcategoryLabel =
      [request.issue_subcategory1, request.issue_subcategory2].filter(Boolean).join(' • ') || '-';

    return {
      id: request.id,
      franchiseName: finalFranchise,
      outletName: finalOutlet,
      contactName: request.merchant_name,
      phoneNumber: request.phone_number,
      whatsappHref,
      fid: request.fid,
      fidHref,
      oid: request.oid,
      issueType: request.issue_type,
      issueSubcategoryLabel,
      clickupLink: request.clickup_link,
      clickupStatus: request.clickup_task_status,
      status: request.status,
      msPicDisplay: request.ms_pic_user_id
        ? userDisplayById.get(String(request.ms_pic_user_id)) ?? 'Assigned'
        : 'Unassigned',
      createdAtLabel: formatDate(request.created_at),
      createdAtMs: request.created_at.getTime(),
      closedAtLabel: request.closed_at ? formatDate(request.closed_at) : null,
      durationLabel: request.closed_at ? formatDuration(request.created_at, request.closed_at) : null,
      ticketPayload,
      franchiseResolved: franchiseDisplay ?? null,
      outletResolved: outletDisplay ?? null,
      showAttend: Boolean(isMsUser && authUser.id && request.ms_pic_user_id !== authUser.id && request.status === 'Open'),
    };
  });

  return (
    <div className={styles.page}>
      <TicketsAutoRefresh interval={15000} />
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.heroTitle}>Support Tickets</h1>
            <p className={styles.heroSubtitle}>
              Monitor merchant issues, review attachments, and update status in real time. All timestamps display in{' '}
              {env.timezone}.
            </p>
          </div>
          <div className={styles.heroActions}>
            <a href="/supportform" className={styles.supportFormLink} target="_blank" rel="noreferrer">
              Open Support Form
            </a>
          </div>
        </div>
      </section>

      <form className={styles.filtersCard} action={applyFiltersAction}>
        <div className={styles.filtersGrid}>
          <label>
            Keyword
            <SearchKeywordInput
              placeholder="Merchant, phone, issue type..."
              defaultValue={filters.query ?? ''}
              onSearch={applyFiltersAction}
            />
          </label>
          <label>
            Status
            <StatusFilterSelect
              options={STATUS_OPTIONS}
              defaultValue={filters.status ?? ''}
              onStatusChange={applyFiltersAction}
            />
          </label>
          <label>
            ClickUp
            <ClickUpFilterSelect
              defaultValue={
                filters.hasClickUp === true ? 'with' : filters.hasClickUp === false ? 'without' : ''
              }
              onChangeFilter={applyFiltersAction}
            />
          </label>
          {canHideTicket ? (
            <label>
              Archived
              <ArchivedFilterSelect defaultValue={archivedFilter} onChangeFilter={applyFiltersAction} />
            </label>
          ) : null}
          <div className={styles.datePickerWrapper}>
            <DateRangePicker from={filters.from ?? null} to={filters.to ?? null} timezone={env.timezone} />
          </div>
        </div>
        <div className={styles.filtersActions}>
          <a className={styles.exportLink} href={exportHref}>
            Download CSV
          </a>
          <button type="submit" formAction={resetFiltersAction} className={styles.resetBtn}>
            Reset filters
          </button>
        </div>
      </form>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2>Tickets</h2>
          <span>{resolvedTotal} results</span>
        </div>
        <TicketsTable
          rows={ticketRows}
          statusOptions={STATUS_OPTIONS}
          timezone={env.timezone}
          categoryOptions={supportFormSettings.categoryOptions}
          userDisplayById={userDisplayById}
          onSave={updateTicketAction}
          onCreateClickUpTask={createClickUpTaskAction}
          onLinkClickUpTask={linkClickUpTaskAction}
          onUnlinkClickUpTask={unlinkClickUpTaskAction}
          onRefreshClickUpStatus={refreshClickUpStatusAction}
          onMarkCsatWhatsappSent={markCsatWhatsappSentAction}
          clickupEnabled={CLICKUP_ENABLED}
          canHideTicket={canHideTicket}
          onHideTicket={archiveTicketFormAction}
          onAttendTicket={attendTicketAction}
        />
        <div className={styles.paginationBar}>
          <div className={styles.paginationPerPage}>
            <span className={styles.paginationLabel}>Rows per page</span>
            <RowsPerPageControls options={PER_PAGE_OPTIONS} current={perPage} onChange={changePerPageAction} />
          </div>
          <div className={styles.paginationInfo}>
            Showing {startIndex}-{endIndex} of {resolvedTotal}
          </div>
          <PaginationControlButtons
            page={page}
            totalPages={totalPages}
            previousPage={previousPage}
            nextPage={nextPage}
            onChange={changePageAction}
          />
        </div>
      </section>
    </div>
  );
}
