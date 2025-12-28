export const PER_PAGE_OPTIONS = [5, 10, 20, 40, 80] as const;
export const DEFAULT_PER_PAGE = 20;

export type SortKey = 'fid' | 'franchise' | 'outlets';
export type SortDirection = 'asc' | 'desc';

export const DEFAULT_SORT_KEY: SortKey = 'fid';
export const DEFAULT_SORT_DIRECTION: SortDirection = 'desc';
