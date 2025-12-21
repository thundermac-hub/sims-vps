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
