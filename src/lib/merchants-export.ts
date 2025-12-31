import type { AccountTypeFilter, FranchiseSummary } from './franchise';
import { listAllCachedFranchises, searchCachedFranchises } from './franchise-cache';

type SortKey = 'fid' | 'franchise' | 'outlets';
type SortDirection = 'asc' | 'desc';
type SortOptions = { key: SortKey; direction: SortDirection };

export type MerchantsExportFilters = {
  query?: string;
  sort?: SortOptions;
  accountType?: AccountTypeFilter;
};

type MerchantExportRow = {
  fid: string;
  franchiseName: string;
  company: string;
  companyAddress: string;
  franchiseCreatedAt: string;
  franchiseUpdatedAt: string;
  outletCount: number;
  outletId: string;
  outletName: string;
  outletAddress: string;
  outletMapsUrl: string;
  outletValidUntil: string;
  outletStatus: string;
  outletCreatedAt: string;
  outletUpdatedAt: string;
};

const normalizeText = (value: string | null | undefined): string => (value ?? '').trim();

const formatFranchiseExportName = (name: string | null | undefined, closedAccount?: boolean | null): string => {
  const cleaned = normalizeText(name);
  if (!closedAccount) {
    return cleaned;
  }
  if (!cleaned) {
    return '[CLOSED]';
  }
  return cleaned.toUpperCase().includes('[CLOSED]') ? cleaned : `[CLOSED] ${cleaned}`;
};

const normalizeDateInput = (value: string): string =>
  value.replace(/([+-]\d{2})(\d{2})$/, (_match, hours, minutes) => `${hours}:${minutes}`);

const formatDateTime = (value: string | null | undefined): string => {
  const cleaned = (value ?? '').trim();
  if (!cleaned) {
    return '';
  }
  const normalised = normalizeDateInput(cleaned);
  const parsed = Date.parse(normalised);
  if (Number.isNaN(parsed)) {
    return cleaned;
  }
  const date = new Date(parsed);
  const datePart = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .toUpperCase();
  return `${datePart} ${timePart}`;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const getOutletStatusLabel = (value: string | null | undefined): string => {
  const cleaned = (value ?? '').trim();
  if (!cleaned) {
    return 'Active';
  }
  const normalised = normalizeDateInput(cleaned);
  const parsed = Date.parse(normalised);
  if (Number.isNaN(parsed)) {
    return 'Active';
  }
  const diff = parsed - Date.now();
  if (diff < 0) {
    return 'Expired';
  }
  if (diff <= THIRTY_DAYS_MS) {
    return 'Expiring Soon';
  }
  return 'Active';
};

const buildExportRows = (franchises: FranchiseSummary[]): MerchantExportRow[] => {
  const rows: MerchantExportRow[] = [];

  franchises.forEach((franchise) => {
    const baseRow = {
      fid: normalizeText(franchise.fid),
      franchiseName: formatFranchiseExportName(franchise.name, franchise.closedAccount),
      company: normalizeText(franchise.company),
      companyAddress: normalizeText(franchise.companyAddress),
      franchiseCreatedAt: formatDateTime(franchise.createdAt),
      franchiseUpdatedAt: formatDateTime(franchise.updatedAt),
      outletCount: franchise.outlets.length,
    };

    if (franchise.outlets.length === 0) {
      rows.push({
        ...baseRow,
        outletId: '',
        outletName: '',
        outletAddress: '',
        outletMapsUrl: '',
        outletValidUntil: '',
        outletStatus: '',
        outletCreatedAt: '',
        outletUpdatedAt: '',
      });
      return;
    }

    franchise.outlets.forEach((outlet) => {
      rows.push({
        ...baseRow,
        outletId: normalizeText(outlet.id),
        outletName: normalizeText(outlet.name),
        outletAddress: normalizeText(outlet.address),
        outletMapsUrl: normalizeText(outlet.mapsUrl),
        outletValidUntil: formatDateTime(outlet.validUntil),
        outletStatus: getOutletStatusLabel(outlet.validUntil),
        outletCreatedAt: formatDateTime(outlet.createdAt),
        outletUpdatedAt: formatDateTime(outlet.updatedAt),
      });
    });
  });

  return rows;
};

export async function fetchMerchantsExportRows(filters: MerchantsExportFilters): Promise<MerchantExportRow[]> {
  const query = filters.query?.trim() ?? '';
  const accountFilters = {
    accountType: filters.accountType ?? 'all',
  };
  const franchises = query
    ? await searchCachedFranchises(query, filters.sort, accountFilters)
    : await listAllCachedFranchises(filters.sort, accountFilters);
  return buildExportRows(franchises);
}

const csvEscape = (value: unknown): string => {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const exportColumns: Array<{ label: string; value: (row: MerchantExportRow) => unknown }> = [
  { label: 'FID', value: (row) => row.fid },
  { label: 'Franchise Name', value: (row) => row.franchiseName },
  { label: 'Company', value: (row) => row.company },
  { label: 'Company Address', value: (row) => row.companyAddress },
  { label: 'Franchise Created At', value: (row) => row.franchiseCreatedAt },
  { label: 'Franchise Updated At', value: (row) => row.franchiseUpdatedAt },
  { label: 'Outlet Count', value: (row) => row.outletCount },
  { label: 'Outlet ID', value: (row) => row.outletId },
  { label: 'Outlet Name', value: (row) => row.outletName },
  { label: 'Outlet Address', value: (row) => row.outletAddress },
  { label: 'Outlet Maps URL', value: (row) => row.outletMapsUrl },
  { label: 'Outlet Status', value: (row) => row.outletStatus },
  { label: 'Outlet Valid Until', value: (row) => row.outletValidUntil },
  { label: 'Outlet Created At', value: (row) => row.outletCreatedAt },
  { label: 'Outlet Updated At', value: (row) => row.outletUpdatedAt },
];

export function buildMerchantsExportCsv(rows: MerchantExportRow[]): string {
  const header = exportColumns.map((column) => column.label).join(',');
  const lines = rows.map((row) => exportColumns.map((column) => csvEscape(column.value(row))).join(','));
  return [header, ...lines].join('\n');
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatSortLabel = (sort?: SortOptions): string => {
  if (!sort) {
    return 'FID (desc)';
  }
  const label = sort.key === 'fid' ? 'FID' : sort.key === 'franchise' ? 'Franchise' : 'Outlets';
  return `${label} (${sort.direction})`;
};

export function buildMerchantsExportHtml(rows: MerchantExportRow[], filters: MerchantsExportFilters): string {
  const now = new Date();
  const safeQuery = filters.query?.trim() ?? '';
  const sortLabel = formatSortLabel(filters.sort);
  const headerCells = exportColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const bodyRows = rows
    .map((row) => {
      const cells = exportColumns
        .map((column) => {
          const value = column.value(row);
          return `<td>${escapeHtml(value === null || value === undefined ? '' : String(value))}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Merchant Directory Export</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        margin: 32px;
        color: #111827;
      }
      h1 {
        margin: 0 0 6px;
        font-size: 22px;
      }
      .meta {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 18px;
      }
      .meta span {
        display: inline-block;
        margin-right: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      thead th {
        text-align: left;
        padding: 8px;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
      }
      tbody td {
        padding: 8px;
        border: 1px solid #e5e7eb;
        vertical-align: top;
        word-break: break-word;
      }
      tbody tr:nth-child(even) td {
        background: #fafafa;
      }
      @media print {
        body {
          margin: 16px;
        }
        .meta {
          color: #374151;
        }
      }
    </style>
  </head>
  <body>
    <h1>Merchant Directory Export</h1>
    <div class="meta">
      <span>Generated: ${escapeHtml(now.toLocaleString('en-GB'))}</span>
      <span>Query: ${escapeHtml(safeQuery || 'All merchants')}</span>
      <span>Sort: ${escapeHtml(sortLabel)}</span>
      <span>Total Rows: ${rows.length}</span>
    </div>
    <table>
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>
        ${bodyRows || `<tr><td colspan="${exportColumns.length}">No merchants found.</td></tr>`}
      </tbody>
    </table>
    <script>
      window.addEventListener('load', () => {
        window.print();
      });
    </script>
  </body>
</html>`;
}
