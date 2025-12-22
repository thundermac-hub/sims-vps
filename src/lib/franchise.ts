import { env } from './env';

const API_BASE_URL = 'https://api.getslurp.com';
const TOKEN_DRIFT_BUFFER_MS = 60_000; // refresh a minute early to avoid edge expiries

type CachedToken = {
  token: string;
  expiresAt: number;
};

export type FranchiseLookupResult = {
  franchiseName: string | null;
  outletName: string | null;
  found: boolean;
};

export type FranchiseOutletSummary = {
  id: string | null;
  name: string | null;
};

export type FranchiseSummary = {
  fid: string | null;
  name: string | null;
  outlets: FranchiseOutletSummary[];
};

export type FranchiseListResult = {
  franchises: FranchiseSummary[];
  currentPage: number;
  perPage: number;
  totalCount: number | null;
  totalPages: number | null;
};

export type FranchiseListRawResult = {
  rows: unknown[];
  currentPage: number;
  perPage: number;
  totalCount: number | null;
  totalPages: number | null;
};

let cachedToken: CachedToken | null = null;

function hasValidToken(): boolean {
  if (!cachedToken) {
    return false;
  }
  return cachedToken.expiresAt - TOKEN_DRIFT_BUFFER_MS > Date.now();
}

async function fetchAuthToken(): Promise<string | null> {
  if (!env.franchiseApiEmail || !env.franchiseApiPassword) {
    console.warn('Franchise API credentials missing (CLOUD_API_EMAIL / CLOUD_API_PASSWORD)');
    return null;
  }

  if (hasValidToken()) {
    return cachedToken!.token;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        email: env.franchiseApiEmail,
        password: env.franchiseApiPassword,
      }),
    });

    if (!response.ok) {
      console.error('Failed to fetch franchise API token', response.status, response.statusText);
      return null;
    }

    const payload = (await response.json()) as {
      api_token?: string;
      expires_at?: string;
    };
    if (!payload.api_token || !payload.expires_at) {
      console.error('Franchise API token response missing fields');
      return null;
    }

    const expiresAt = Date.parse(payload.expires_at);
    if (Number.isNaN(expiresAt)) {
      console.error('Unable to parse franchise API token expiry', payload.expires_at);
      return null;
    }

    cachedToken = {
      token: payload.api_token,
      expiresAt,
    };

    return cachedToken.token;
  } catch (error) {
    console.error('Error fetching franchise API token', error);
    return null;
  }
}

export async function fetchFranchiseOutlet(fid: string, oid: string): Promise<FranchiseLookupResult | null> {
  const fidClean = String(fid ?? '').trim().replace(/\D/g, '');
  const oidClean = String(oid ?? '').trim().replace(/\D/g, '');
  if (!fidClean || !oidClean) {
    return null;
  }

  const doFetch = async (retrying = false): Promise<FranchiseLookupResult | null> => {
    const token = await fetchAuthToken();
    if (!token) {
      return null;
    }

    try {
      const url = new URL(
        `${API_BASE_URL}/api/franchise-retrieve/${encodeURIComponent(fidClean)}/${encodeURIComponent(oidClean)}`,
      );
      // Some backends expect the token as a query param; include it alongside the bearer header to be safe.
      url.searchParams.set('api_token', token);

      const response = await fetch(
        url.toString(),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          cache: 'no-store',
        },
      );

      if (response.status === 401 && !retrying) {
        cachedToken = null;
        return doFetch(true);
      }

      if (response.status === 401) {
        return null; // treat as unavailable so we fallback to stored values instead of showing "No Outlet Found"
      }

      if (!response.ok) {
        if (response.status !== 404) {
          console.warn('Franchise lookup failed', response.status, response.statusText);
        }
        return { franchiseName: null, outletName: null, found: false };
      }

      const data = await response.json();
      const franchiseName =
        data && typeof data.name === 'string' && data.name.trim().length > 0 ? (data.name as string).trim() : null;

      let outletName: string | null = null;
      if (data && typeof data.outlets === 'object' && data.outlets !== null) {
        if (Array.isArray(data.outlets) && data.outlets.length > 0) {
          const first = data.outlets.find((outlet: unknown) => outlet && typeof outlet === 'object' && 'name' in outlet);
          outletName =
            first && typeof (first as { name?: unknown }).name === 'string'
              ? ((first as { name: string }).name || '').trim() || null
              : null;
        } else if (typeof (data.outlets as { name?: unknown }).name === 'string') {
          outletName = ((data.outlets as { name: string }).name || '').trim() || null;
        }
      }

      const found = Boolean(franchiseName || outletName);
      return { franchiseName, outletName, found };
    } catch (error) {
      console.error('Error fetching franchise/outlet name', error);
      return { franchiseName: null, outletName: null, found: false };
    }
  };

  return doFetch(false);
}

const FRANCHISE_LIST_KEYS = ['data', 'results', 'franchises'];

const franchiseString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const franchiseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

const pickFranchiseField = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    if (key in record) {
      const value = franchiseString(record[key]);
      if (value) {
        return value;
      }
    }
  }
  return null;
};

const normalizeOutlet = (raw: unknown): FranchiseOutletSummary | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = pickFranchiseField(record, ['name', 'outlet_name', 'outletName']);
  const id = pickFranchiseField(record, ['oid', 'outlet_id', 'outletId', 'id']);
  if (!name && !id) {
    return null;
  }
  return { id, name };
};

const normalizeOutlets = (raw: unknown): FranchiseOutletSummary[] => {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map(normalizeOutlet).filter((entry): entry is FranchiseOutletSummary => Boolean(entry));
  }
  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data.map(normalizeOutlet).filter((entry): entry is FranchiseOutletSummary => Boolean(entry));
    }
    if (Array.isArray(record.outlets)) {
      return record.outlets.map(normalizeOutlet).filter((entry): entry is FranchiseOutletSummary => Boolean(entry));
    }
    const direct = normalizeOutlet(record);
    if (direct) {
      return [direct];
    }
    const values = Object.values(record);
    if (values.some((value) => value && typeof value === 'object')) {
      return values.map(normalizeOutlet).filter((entry): entry is FranchiseOutletSummary => Boolean(entry));
    }
  }
  return [];
};

export const toFranchiseSummary = (raw: unknown): FranchiseSummary | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const fid = pickFranchiseField(record, ['fid', 'FID', 'franchise_id', 'franchiseId', 'id']);
  const name = pickFranchiseField(record, ['name', 'franchise_name', 'franchiseName', 'merchant_name', 'merchantName']);
  const outlets = normalizeOutlets(
    record.outlets ?? record.outlet ?? record.stores ?? record.store ?? record.locations ?? record.branches,
  );
  if (!fid && !name && outlets.length === 0) {
    return null;
  }
  return {
    fid,
    name,
    outlets,
  };
};

const extractFranchiseList = (payload: unknown): { rows: unknown[]; meta: Record<string, unknown> | null } => {
  if (Array.isArray(payload)) {
    return { rows: payload, meta: null };
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of FRANCHISE_LIST_KEYS) {
      if (Array.isArray(record[key])) {
        return { rows: record[key] as unknown[], meta: record };
      }
    }
  }
  return { rows: [], meta: null };
};

const parseFranchiseMeta = (
  meta: Record<string, unknown> | null,
  safePage: number,
  safePerPage: number,
): Omit<FranchiseListRawResult, 'rows'> => {
  const totalCount =
    (meta && franchiseNumber(meta.total)) ??
    (meta && franchiseNumber(meta.total_count)) ??
    (meta && franchiseNumber(meta.count)) ??
    null;
  const perPageFromMeta = (meta && franchiseNumber(meta.per_page)) ?? safePerPage;
  const currentPage =
    (meta && franchiseNumber(meta.current_page)) ?? (meta && franchiseNumber(meta.page)) ?? safePage;
  const totalPages =
    (meta && franchiseNumber(meta.last_page)) ??
    (meta && franchiseNumber(meta.total_pages)) ??
    (meta && franchiseNumber(meta.totalPages)) ??
    (totalCount ? Math.max(1, Math.ceil(totalCount / perPageFromMeta)) : null);

  return {
    currentPage,
    perPage: perPageFromMeta,
    totalCount,
    totalPages,
  };
};

export async function fetchFranchiseListRaw(page: number, perPage: number): Promise<FranchiseListRawResult> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 25;

  const doFetch = async (retrying = false): Promise<FranchiseListRawResult> => {
    const token = await fetchAuthToken();
    if (!token) {
      return {
        rows: [],
        currentPage: safePage,
        perPage: safePerPage,
        totalCount: null,
        totalPages: null,
      };
    }

    try {
      const url = new URL(`${API_BASE_URL}/api/franchise-retrieve/`);
      url.searchParams.set('per_page', String(safePerPage));
      url.searchParams.set('page', String(safePage));
      url.searchParams.set('api_token', token);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (response.status === 401 && !retrying) {
        cachedToken = null;
        return doFetch(true);
      }

      if (!response.ok) {
        console.warn('Franchise list lookup failed', response.status, response.statusText);
        return {
          rows: [],
          currentPage: safePage,
          perPage: safePerPage,
          totalCount: null,
          totalPages: null,
        };
      }

      const payload = (await response.json()) as unknown;
      const { rows, meta } = extractFranchiseList(payload);
      const metaResult = parseFranchiseMeta(meta, safePage, safePerPage);
      return { rows, ...metaResult };
    } catch (error) {
      console.error('Error fetching franchise list', error);
      return {
        rows: [],
        currentPage: safePage,
        perPage: safePerPage,
        totalCount: null,
        totalPages: null,
      };
    }
  };

  return doFetch(false);
}

export async function fetchFranchiseList(page: number, perPage: number): Promise<FranchiseListResult> {
  const { rows, ...meta } = await fetchFranchiseListRaw(page, perPage);
  const franchises = rows.map(toFranchiseSummary).filter((entry): entry is FranchiseSummary => Boolean(entry));
  return {
    franchises,
    ...meta,
  };
}

export async function fetchAllFranchises(perPage: number, maxPages = 50): Promise<FranchiseSummary[]> {
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 100;
  const safeMaxPages = Number.isFinite(maxPages) && maxPages > 0 ? Math.floor(maxPages) : 50;
  const franchises: FranchiseSummary[] = [];
  let expectedPageSize = safePerPage;

  for (let page = 1; page <= safeMaxPages; page += 1) {
    const response = await fetchFranchiseList(page, safePerPage);
    expectedPageSize = response.perPage || expectedPageSize;
    if (response.franchises.length === 0) {
      break;
    }
    franchises.push(...response.franchises);
    if (response.totalPages && page >= response.totalPages) {
      break;
    }
    if (response.franchises.length < expectedPageSize) {
      break;
    }
  }

  return franchises;
}
