import { NextRequest, NextResponse } from 'next/server';
import { buildExportCsv, RequestFilters, RequestStatus } from '@/lib/requests';
import { DATE_RANGE_COOKIE } from '@/lib/preferences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseFilters(searchParams: URLSearchParams): RequestFilters {
  const status = searchParams.get('status');
  const query = searchParams.get('q') || undefined;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const clickup = searchParams.get('clickup');
  const hasClickUp = clickup === 'with' ? true : clickup === 'without' ? false : undefined;

  return {
    status: status && isStatus(status) ? (status as RequestStatus) : undefined,
    query,
    from,
    to,
    hasClickUp,
  };
}

function isStatus(value: string): value is RequestStatus {
  return ['Open', 'In Progress', 'Pending Customer', 'Resolved'].includes(value);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  if ((!filters.from || !filters.to) && request.cookies.has(DATE_RANGE_COOKIE)) {
    const saved = request.cookies.get(DATE_RANGE_COOKIE)?.value ?? '';
    const [savedFrom = '', savedTo = ''] = saved.split('|');
    if (!filters.from && savedFrom) {
      filters.from = savedFrom;
    }
    if (!filters.to && (savedTo || savedFrom)) {
      filters.to = savedTo || savedFrom;
    }
  }
  const csv = await buildExportCsv(filters);
  const headers = new Headers();
  headers.set('Content-Type', 'text/csv; charset=utf-8');
  headers.set('Content-Disposition', 'attachment; filename="support_requests.csv"');
  return new NextResponse(csv, { headers });
}

export function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
