import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessMerchantsPages } from '@/lib/branding';
import {
  buildMerchantsExportCsv,
  buildMerchantsExportHtml,
  fetchMerchantsExportRows,
  type MerchantsExportFilters,
} from '@/lib/merchants-export';
import { MERCHANTS_VIEW_COOKIE } from '@/lib/preferences';
import { parseMerchantsViewState } from '../../../(protected)/merchants/view-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SortKey = 'fid' | 'franchise' | 'outlets';
type SortDirection = 'asc' | 'desc';

const DEFAULT_SORT_KEY: SortKey = 'fid';
const DEFAULT_SORT_DIRECTION: SortDirection = 'desc';

const parseSortKey = (value: string | null): SortKey => {
  if (value === 'fid' || value === 'franchise' || value === 'outlets') {
    return value;
  }
  return DEFAULT_SORT_KEY;
};

const parseSortDirection = (value: string | null): SortDirection => {
  if (value === 'asc' || value === 'desc') {
    return value;
  }
  return DEFAULT_SORT_DIRECTION;
};

const parseAccountType = (value: string | null): 'all' | 'live' | 'test' | 'closed' => {
  if (value === 'live' || value === 'test' || value === 'closed' || value === 'all') {
    return value;
  }
  return 'all';
};

const parseFilters = (
  searchParams: URLSearchParams,
  cookieState: ReturnType<typeof parseMerchantsViewState>,
): MerchantsExportFilters => {
  const rawQuery = searchParams.get('q') ?? '';
  const query = rawQuery.trim() || cookieState.query || '';
  const sortKeyParam = searchParams.get('sort');
  const sortDirectionParam = searchParams.get('dir');
  const sortKey = sortKeyParam ? parseSortKey(sortKeyParam) : cookieState.sortKey;
  const sortDirection = sortDirectionParam ? parseSortDirection(sortDirectionParam) : cookieState.sortDirection;
  const accountParam = searchParams.get('accountType');
  const accountType = accountParam ? parseAccountType(accountParam) : cookieState.accountType;
  return {
    query: query || undefined,
    sort: { key: sortKey, direction: sortDirection },
    accountType,
  };
};

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!canAccessMerchantsPages(authUser.department, authUser.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv';
  const cookieValue = request.cookies.get(MERCHANTS_VIEW_COOKIE)?.value ?? null;
  const viewState = parseMerchantsViewState(cookieValue);
  const filters = parseFilters(url.searchParams, viewState);
  const rows = await fetchMerchantsExportRows(filters);

  if (format === 'pdf') {
    const html = buildMerchantsExportHtml(rows, filters);
    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new NextResponse(html, { headers });
  }

  const csv = buildMerchantsExportCsv(rows);
  const headers = new Headers();
  headers.set('Content-Type', 'text/csv; charset=utf-8');
  headers.set('Content-Disposition', 'attachment; filename="merchants.csv"');
  return new NextResponse(csv, { headers });
}

export function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
