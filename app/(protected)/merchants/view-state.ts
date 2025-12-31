import {
  DEFAULT_PER_PAGE,
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  PER_PAGE_OPTIONS,
  type SortDirection,
  type SortKey,
} from './constants';
import type { AccountTypeFilter } from '@/lib/franchise';

export type MerchantsViewState = {
  query: string | null;
  page: number;
  perPage: number;
  sortKey: SortKey;
  sortDirection: SortDirection;
  accountType: AccountTypeFilter;
};

export const DEFAULT_VIEW_STATE: MerchantsViewState = {
  query: null,
  page: 1,
  perPage: DEFAULT_PER_PAGE,
  sortKey: DEFAULT_SORT_KEY,
  sortDirection: DEFAULT_SORT_DIRECTION,
  accountType: 'all',
};

export function parseMerchantsViewState(value: string | undefined | null): MerchantsViewState {
  if (!value) {
    return { ...DEFAULT_VIEW_STATE };
  }
  try {
    const parsed = JSON.parse(value) as Partial<MerchantsViewState>;
    const query = typeof parsed.query === 'string' && parsed.query.trim().length > 0 ? parsed.query : null;
    const perPageCandidate = Number(parsed.perPage);
    const perPage = PER_PAGE_OPTIONS.includes(perPageCandidate as (typeof PER_PAGE_OPTIONS)[number])
      ? perPageCandidate
      : DEFAULT_PER_PAGE;
    const pageCandidate = Number(parsed.page);
    const page = Number.isFinite(pageCandidate) && pageCandidate > 0 ? Math.floor(pageCandidate) : 1;
    const sortKey: SortKey =
      parsed.sortKey === 'fid' || parsed.sortKey === 'franchise' || parsed.sortKey === 'outlets'
        ? parsed.sortKey
        : DEFAULT_SORT_KEY;
    const sortDirection: SortDirection =
      parsed.sortDirection === 'asc' || parsed.sortDirection === 'desc' ? parsed.sortDirection : DEFAULT_SORT_DIRECTION;
    const accountType: AccountTypeFilter =
      parsed.accountType === 'live' || parsed.accountType === 'test' || parsed.accountType === 'closed'
        ? parsed.accountType
        : 'all';
    return {
      query,
      page,
      perPage,
      sortKey,
      sortDirection,
      accountType,
    };
  } catch {
    return { ...DEFAULT_VIEW_STATE };
  }
}
