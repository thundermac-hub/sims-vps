import { isClickUpEnabled } from '@/lib/clickup';
import type { RequestStatus } from '@/lib/requests';

export const STATUS_OPTIONS: RequestStatus[] = ['Open', 'In Progress', 'Pending Customer', 'Resolved'];
export const PER_PAGE_OPTIONS = [5, 10, 20, 40, 80] as const;
export const DEFAULT_PER_PAGE = 20;
export const SEARCH_FETCH_LIMIT = 500;
export const MERCHANT_SUCCESS_DEPARTMENT = 'merchant success';
export const CLICKUP_ENABLED = isClickUpEnabled();
export const NO_OUTLET_FOUND = 'No Outlet Found';
