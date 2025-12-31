import { env } from './env';
import { getSupabaseAdminClient } from './db';
import type { RequestStatus } from './requests';
import { listMerchantSuccessUsers } from './users';

export type MsPicMetric = {
  userId: number | null;
  label: string;
  count: number;
};

export type IssueTypeMetric = {
  issueType: string;
  count: number;
};

export type DashboardMetrics = {
  openCount: number;
  inProgressCount: number;
  pendingCustomerCount: number;
  newTicketsToday: number;
  newTicketsYesterday: number;
  resolvedToday: number;
  resolvedYesterday: number;
  msPicWorkload: MsPicMetric[];
  msPicPendingCustomer: MsPicMetric[];
  msPicResolvedToday: MsPicMetric[];
  openByIssueType: IssueTypeMetric[];
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = getSupabaseAdminClient();
  const todayRange = getDayRange(env.timezone, 0);
  const yesterdayRange = getDayRange(env.timezone, -1);
  const baseSelect = (columns: string, options?: { count?: 'exact'; head?: boolean }) =>
    supabase.from('support_requests').select(columns, options);

  const applyArchivedFilter = (query: any, filterArchived: boolean) =>
    filterArchived ? query.eq('hidden', false) : query;

  const loadMetrics = async (filterArchived: boolean) =>
    Promise.all([
      applyArchivedFilter(baseSelect('id', { count: 'exact', head: true }).eq('status', 'Open'), filterArchived),
      applyArchivedFilter(baseSelect('id', { count: 'exact', head: true }).eq('status', 'In Progress'), filterArchived),
      applyArchivedFilter(
        baseSelect('id', { count: 'exact', head: true }).eq('status', 'Pending Customer'),
        filterArchived,
      ),
      applyArchivedFilter(
        baseSelect('id', { count: 'exact', head: true }).gte('created_at', todayRange.start).lte('created_at', todayRange.end),
        filterArchived,
      ),
      applyArchivedFilter(
        baseSelect('id', { count: 'exact', head: true })
          .gte('created_at', yesterdayRange.start)
          .lte('created_at', yesterdayRange.end),
        filterArchived,
      ),
      applyArchivedFilter(
        baseSelect('id', { count: 'exact', head: true })
          .eq('status', 'Resolved')
          .gte('closed_at', todayRange.start)
          .lte('closed_at', todayRange.end),
        filterArchived,
      ),
      applyArchivedFilter(
        baseSelect('id', { count: 'exact', head: true })
          .eq('status', 'Resolved')
          .gte('closed_at', yesterdayRange.start)
          .lte('closed_at', yesterdayRange.end),
        filterArchived,
      ),
      applyArchivedFilter(
        baseSelect('ms_pic_user_id').in('status', ['Open', 'In Progress'] as RequestStatus[]),
        filterArchived,
      ),
      applyArchivedFilter(baseSelect('ms_pic_user_id').eq('status', 'Pending Customer'), filterArchived),
      applyArchivedFilter(
        baseSelect('ms_pic_user_id')
          .eq('status', 'Resolved')
          .gte('closed_at', todayRange.start)
          .lte('closed_at', todayRange.end),
        filterArchived,
      ),
      applyArchivedFilter(baseSelect('issue_type').in('status', ['Open', 'In Progress', 'Pending Customer'] as RequestStatus[]), filterArchived),
      listMerchantSuccessUsers({ includeInactive: true }),
    ]);

  let metricsResult;
  try {
    metricsResult = await loadMetrics(true);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === '42703') {
      metricsResult = await loadMetrics(false);
    } else {
      throw error;
    }
  }
  const [
    openQuery,
    inProgressQuery,
    pendingCustomerQuery,
    newTodayQuery,
    newYesterdayQuery,
    resolvedTodayQuery,
    resolvedYesterdayQuery,
    workloadQuery,
    pendingCustomerPerPicQuery,
    resolvedPerPicQuery,
    openByTypeQuery,
    msPicUsers,
  ] = metricsResult;

  const countOrZero = (result: { error: unknown; count: number | null }) => {
    if (result.error) {
      throw result.error;
    }
    return result.count ?? 0;
  };

  const openCount = countOrZero(openQuery);
  const inProgressCount = countOrZero(inProgressQuery);
  const pendingCustomerCount = countOrZero(pendingCustomerQuery);
  const newTicketsToday = countOrZero(newTodayQuery);
  const newTicketsYesterday = countOrZero(newYesterdayQuery);
  const resolvedToday = countOrZero(resolvedTodayQuery);
  const resolvedYesterday = countOrZero(resolvedYesterdayQuery);

  if (workloadQuery.error) {
    throw workloadQuery.error;
  }
  if (pendingCustomerPerPicQuery.error) {
    throw pendingCustomerPerPicQuery.error;
  }
  if (resolvedPerPicQuery.error) {
    throw resolvedPerPicQuery.error;
  }
  if (openByTypeQuery.error) {
    throw openByTypeQuery.error;
  }

  const msPicLabelMap = new Map<number, string>();
  msPicUsers.forEach((user) => {
    const label = user.name?.trim().length ? user.name : user.email;
    msPicLabelMap.set(user.id, label);
  });

  const msPicWorkload = aggregateMsPicMetrics(workloadQuery.data ?? [], msPicLabelMap);
  const msPicPendingCustomer = aggregateMsPicMetrics(pendingCustomerPerPicQuery.data ?? [], msPicLabelMap);
  const msPicResolvedToday = aggregateMsPicMetrics(resolvedPerPicQuery.data ?? [], msPicLabelMap);
  const openByIssueType = aggregateIssueTypeMetrics(openByTypeQuery.data ?? []);

  return {
    openCount,
    inProgressCount,
    pendingCustomerCount,
    newTicketsToday,
    newTicketsYesterday,
    resolvedToday,
    resolvedYesterday,
    msPicWorkload,
    msPicPendingCustomer,
    msPicResolvedToday,
    openByIssueType,
  };
}

function aggregateMsPicMetrics(
  rows: Array<{ ms_pic_user_id: number | null }>,
  labelMap: Map<number, string>,
): MsPicMetric[] {
  const counts = new Map<number | null, number>();
  rows.forEach((row) => {
    const rawId = row.ms_pic_user_id;
    const id = typeof rawId === 'number' ? rawId : rawId != null ? Number(rawId) : null;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return entries.map(([userId, count]) => ({
    userId,
    label: userId ? labelMap.get(userId) ?? `User #${userId}` : 'Unassigned',
    count,
  }));
}

function aggregateIssueTypeMetrics(rows: Array<{ issue_type: string | null }>): IssueTypeMetric[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = row.issue_type?.trim().length ? row.issue_type.trim() : 'Unspecified';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([issueType, count]) => ({ issueType, count }))
    .sort((a, b) => b.count - a.count);
}

function getDayRange(timezone: string, offsetDays = 0): { start: string; end: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? now.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? now.getUTCMonth() + 1);
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? now.getUTCDate());

  // Build midnight in the target timezone by adjusting UTC with the zone offset at that date.
  const targetBase = Date.UTC(year, month - 1, day + offsetDays, 0, 0, 0, 0);
  const offsetMinutes = getTimezoneOffsetForDate(new Date(targetBase), timezone);
  const startUtc = targetBase - offsetMinutes * 60 * 1000;

  const start = new Date(startUtc);
  const end = new Date(startUtc + 24 * 60 * 60 * 1000 - 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getTimezoneOffsetForDate(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const filled: Record<string, number> = {};
  parts.forEach((p) => {
    if (p.type !== 'literal') filled[p.type] = Number(p.value);
  });
  const adjusted = Date.UTC(
    filled.year,
    (filled.month ?? 1) - 1,
    filled.day ?? 1,
    filled.hour ?? 0,
    filled.minute ?? 0,
    filled.second ?? 0,
  );
  return (adjusted - date.getTime()) / (60 * 1000);
}
