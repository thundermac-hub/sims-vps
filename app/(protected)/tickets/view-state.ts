import type { RequestStatus } from '@/lib/requests';
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS, STATUS_OPTIONS } from './constants';

export type TicketsViewState = {
  query: string | null;
  status: RequestStatus | null;
  perPage: number;
  page: number;
  hasClickUp: boolean | null;
  archivedFilter: 'active' | 'archived' | 'all';
};

export const DEFAULT_VIEW_STATE: TicketsViewState = {
  query: null,
  status: null,
  perPage: DEFAULT_PER_PAGE,
  page: 1,
  hasClickUp: null,
  archivedFilter: 'active',
};

export function parseViewState(value: string | undefined | null): TicketsViewState {
  if (!value) {
    return { ...DEFAULT_VIEW_STATE };
  }
  try {
    const parsed = JSON.parse(value) as Partial<TicketsViewState>;
    const query = typeof parsed.query === 'string' && parsed.query.trim().length > 0 ? parsed.query : null;
    const status =
      typeof parsed.status === 'string' && STATUS_OPTIONS.includes(parsed.status as RequestStatus)
        ? (parsed.status as RequestStatus)
        : null;
    const perPageCandidate = Number(parsed.perPage);
    const perPage = PER_PAGE_OPTIONS.includes(perPageCandidate as (typeof PER_PAGE_OPTIONS)[number])
      ? perPageCandidate
      : DEFAULT_PER_PAGE;
    const pageCandidate = Number(parsed.page);
    const page = Number.isFinite(pageCandidate) && pageCandidate > 0 ? Math.floor(pageCandidate) : 1;
    const hasClickUp =
      typeof parsed.hasClickUp === 'boolean'
        ? parsed.hasClickUp
        : parsed.hasClickUp === null
          ? null
          : null;
    const archivedFilter =
      parsed && typeof (parsed as { archivedFilter?: string }).archivedFilter === 'string'
        ? ((parsed as { archivedFilter?: string }).archivedFilter as TicketsViewState['archivedFilter'])
        : 'active';

    return {
      query,
      status,
      perPage,
      page,
      hasClickUp,
      archivedFilter,
    };
  } catch {
    return { ...DEFAULT_VIEW_STATE };
  }
}
