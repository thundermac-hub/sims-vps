import { getSupabaseAdminClient } from './db';
import {
  fetchFranchiseListRaw,
  toFranchiseSummary,
  type FranchiseOutletSummary,
  type FranchiseSummary,
} from './franchise';

export type FranchiseImportStatus = 'running' | 'completed' | 'failed';
export type FranchiseImportTrigger = 'cron' | 'manual';

export type FranchiseImportJob = {
  id: number;
  status: FranchiseImportStatus;
  processedCount: number;
  totalCount: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  trigger: FranchiseImportTrigger;
  requestedBy: string | null;
};

type FranchiseImportJobRow = {
  id: number;
  status: FranchiseImportStatus;
  processed_count: number;
  total_count: number | null;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  error_message: string | null;
  import_trigger: FranchiseImportTrigger;
  requested_by: string | null;
};

type FranchiseCacheRow = {
  fid: string | null;
  franchise_name: string | null;
  franchise_json?: unknown;
  outlets_json: unknown;
  outlet_count: number | null;
  import_index: number | null;
};

type FranchiseImportOptions = {
  pageSize?: number;
};

const DEFAULT_IMPORT_PAGE_SIZE = 200;
const MAX_IMPORT_PAGES = 200;

const formatDateValue = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
};

const mapJobRow = (row: FranchiseImportJobRow): FranchiseImportJob => ({
  id: row.id,
  status: row.status,
  processedCount: row.processed_count ?? 0,
  totalCount: row.total_count ?? null,
  startedAt: formatDateValue(row.started_at),
  finishedAt: formatDateValue(row.finished_at),
  errorMessage: row.error_message ?? null,
  trigger: row.import_trigger,
  requestedBy: row.requested_by ?? null,
});

const normaliseString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const pickField = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    if (key in record) {
      const value = normaliseString(record[key]);
      if (value) {
        return value;
      }
    }
  }
  return null;
};

const parseJsonValue = (value: unknown): unknown => {
  if (!value) {
    return null;
  }
  let raw = value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse cached json value', error);
      return null;
    }
  }
  return raw;
};

const normaliseOutlet = (value: unknown): FranchiseOutletSummary | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = pickField(record, ['id', 'oid', 'outlet_id', 'outletId', 'outletID']);
  const name = pickField(record, ['name', 'outlet_name', 'outletName']);
  const address = pickField(record, ['address', 'address_line', 'addressLine']);
  const mapsUrl = pickField(record, ['maps_url', 'mapsUrl', 'map_url', 'mapUrl']);
  const validUntil = pickField(record, ['valid_until', 'validUntil']);
  const createdAt = pickField(record, ['created_at', 'createdAt']);
  const updatedAt = pickField(record, ['updated_at', 'updatedAt']);
  if (!id && !name && !address && !mapsUrl && !validUntil && !createdAt && !updatedAt) {
    return null;
  }
  return { id, name, address, mapsUrl, validUntil, createdAt, updatedAt };
};

const parseOutletList = (value: unknown): FranchiseOutletSummary[] => {
  if (!value) {
    return [];
  }
  const raw = parseJsonValue(value);
  if (Array.isArray(raw)) {
    return raw.map(normaliseOutlet).filter((entry): entry is FranchiseOutletSummary => Boolean(entry));
  }
  if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>;
    const listKeys = ['data', 'outlets', 'stores', 'locations', 'branches'];
    for (const key of listKeys) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate.map(normaliseOutlet).filter((entry): entry is FranchiseOutletSummary => Boolean(entry));
      }
    }
    const direct = normaliseOutlet(record);
    if (direct) {
      return [direct];
    }
    const values = Object.values(record);
    if (values.some((entry) => entry && typeof entry === 'object')) {
      return values.map(normaliseOutlet).filter((entry): entry is FranchiseOutletSummary => Boolean(entry));
    }
  }
  return [];
};

const parseFranchiseDetails = (
  value: unknown,
): {
  fid: string | null;
  name: string | null;
  company: string | null;
  companyAddress: string | null;
  createdAt: string | null;
  updatedAt: string | null;
} | null => {
  const raw = parseJsonValue(value);
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  return {
    fid: pickField(record, ['fid', 'FID', 'franchise_id', 'franchiseId', 'id']),
    name: pickField(record, ['name', 'franchise_name', 'franchiseName', 'merchant_name', 'merchantName']),
    company: pickField(record, ['company', 'company_name', 'companyName']),
    companyAddress: pickField(record, ['company_address', 'companyAddress']),
    createdAt: pickField(record, ['created_at', 'createdAt']),
    updatedAt: pickField(record, ['updated_at', 'updatedAt']),
  };
};

const normalizeDateInput = (value: string): string =>
  value.replace(/([+-]\d{2})(\d{2})$/, (_match, hours, minutes) => `${hours}:${minutes}`);

const parseDateValue = (value: string | null): Date | null => {
  const cleaned = (value ?? '').trim();
  if (!cleaned) {
    return null;
  }
  const normalised = normalizeDateInput(cleaned);
  const parsed = Date.parse(normalised);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed);
};

const isOutletActive = (validUntil: string | null): boolean => {
  const parsed = parseDateValue(validUntil);
  if (!parsed) {
    return true;
  }
  return parsed.getTime() >= Date.now();
};

const countActiveOutlets = (value: unknown): number => {
  const outlets = parseOutletList(value);
  if (outlets.length === 0) {
    return 0;
  }
  return outlets.reduce((total, outlet) => total + (isOutletActive(outlet.validUntil ?? null) ? 1 : 0), 0);
};

export async function listCachedFranchises(page: number, perPage: number): Promise<{
  franchises: FranchiseSummary[];
  totalCount: number;
}> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 25;
  const offset = (safePage - 1) * safePerPage;
  const supabase = getSupabaseAdminClient();

  const { data, error, count } = await supabase
    .from<FranchiseCacheRow>('franchise_cache')
    .select('fid, franchise_name, franchise_json, outlets_json, outlet_count, import_index', { count: 'exact' })
    .eq('is_active', true)
    .gte('outlet_count', 1)
    .order('import_index', { ascending: false })
    .range(offset, offset + safePerPage - 1);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const franchises = rows.map((row) => {
    const details = parseFranchiseDetails(row.franchise_json ?? null);
    return {
      fid: row.fid ?? details?.fid ?? null,
      name: row.franchise_name ?? details?.name ?? null,
      company: details?.company ?? null,
      companyAddress: details?.companyAddress ?? null,
      createdAt: details?.createdAt ?? null,
      updatedAt: details?.updatedAt ?? null,
      outlets: parseOutletList(row.outlets_json),
    };
  });

  return {
    franchises,
    totalCount: typeof count === 'number' ? count : 0,
  };
}

export async function getFranchiseMetrics(): Promise<{
  totalActiveOutlets: number;
}> {
  const supabase = getSupabaseAdminClient();
  const rows = await supabase.query<{ total_active_outlets: number | null }>(
    'SELECT COALESCE(SUM(active_outlet_count), 0) as total_active_outlets FROM franchise_cache WHERE is_active = 1',
  );
  const totalActiveOutlets = Number(rows[0]?.total_active_outlets ?? 0);
  return {
    totalActiveOutlets: Number.isFinite(totalActiveOutlets) ? totalActiveOutlets : 0,
  };
}

export async function getFranchiseImportJob(jobId: number): Promise<FranchiseImportJob | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from<FranchiseImportJobRow>('franchise_import_jobs')
    .select(
      'id, status, processed_count, total_count, started_at, finished_at, error_message, import_trigger, requested_by',
    )
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapJobRow(data);
}

export async function startFranchiseImport(
  trigger: FranchiseImportTrigger,
  requestedBy: string | null,
  options: FranchiseImportOptions = {},
): Promise<FranchiseImportJob> {
  const supabase = getSupabaseAdminClient();
  const existing = await supabase
    .from<FranchiseImportJobRow>('franchise_import_jobs')
    .select(
      'id, status, processed_count, total_count, started_at, finished_at, error_message, import_trigger, requested_by',
    )
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    return mapJobRow(existing.data);
  }

  const { data, error } = await supabase
    .from<FranchiseImportJobRow>('franchise_import_jobs')
    .insert({
      status: 'running',
      import_trigger: trigger,
      processed_count: 0,
      total_count: null,
      requested_by: requestedBy,
    })
    .select(
      'id, status, processed_count, total_count, started_at, finished_at, error_message, import_trigger, requested_by',
    )
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to start franchise import');
  }

  const job = mapJobRow(data);
  const pageSize = options.pageSize ?? DEFAULT_IMPORT_PAGE_SIZE;
  void runFranchiseImport(job.id, pageSize);
  return job;
}

async function runFranchiseImport(jobId: number, pageSize: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  let processedCount = 0;
  let importIndex = 0;
  let page = 1;
  let totalCountSet = false;
  let receivedAnyRows = false;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_IMPORT_PAGE_SIZE;

  try {
    while (true) {
      const response = await fetchFranchiseListRaw(page, safePageSize);
      if (page === 1 && response.rows.length === 0 && response.totalCount === null) {
        throw new Error('Franchise API returned no data.');
      }
      if (response.rows.length > 0) {
        receivedAnyRows = true;
      }
      if (!totalCountSet && typeof response.totalCount === 'number') {
        totalCountSet = true;
        const { error: totalCountError } = await supabase
          .from('franchise_import_jobs')
          .update({ total_count: response.totalCount })
          .eq('id', jobId);
        if (totalCountError) {
          throw totalCountError;
        }
      }
      if (response.rows.length > 0) {
        const cacheRows = response.rows.map((franchise) => {
          const summary = toFranchiseSummary(franchise) ?? { fid: null, name: null, outlets: [] };
          const franchiseJson = JSON.stringify(franchise ?? null) ?? 'null';
          const outletRaw =
            franchise && typeof franchise === 'object'
              ? ((franchise as Record<string, unknown>).outlets ??
                  (franchise as Record<string, unknown>).outlet ??
                  (franchise as Record<string, unknown>).stores ??
                  (franchise as Record<string, unknown>).store ??
                  (franchise as Record<string, unknown>).locations ??
                  (franchise as Record<string, unknown>).branches ??
                  null)
              : null;
          const outletsJson = JSON.stringify(outletRaw ?? null) ?? 'null';
          const activeOutletCount = countActiveOutlets(outletRaw);
          return {
            fid: summary.fid,
            franchise_name: summary.name,
            outlets_json: outletsJson,
            franchise_json: franchiseJson,
            outlet_count: summary.outlets.length,
            active_outlet_count: activeOutletCount,
            import_index: importIndex++,
            job_id: jobId,
            is_active: 0,
          };
        });
        const { error: insertError } = await supabase.from('franchise_cache').insert(cacheRows);
        if (insertError) {
          throw insertError;
        }
        processedCount += cacheRows.length;
        const { error: progressError } = await supabase
          .from('franchise_import_jobs')
          .update({ processed_count: processedCount })
          .eq('id', jobId);
        if (progressError) {
          throw progressError;
        }
      }

      if (response.totalPages && page >= response.totalPages) {
        break;
      }
      if (response.rows.length === 0 || response.rows.length < response.perPage) {
        break;
      }
      if (page >= MAX_IMPORT_PAGES) {
        console.warn('Franchise import reached max page limit', MAX_IMPORT_PAGES);
        break;
      }
      page += 1;
    }

    if (!receivedAnyRows) {
      throw new Error('No franchise data imported.');
    }

    await supabase.query('UPDATE franchise_cache SET is_active = CASE WHEN job_id = ? THEN 1 ELSE 0 END', [jobId]);
    await supabase.query('DELETE FROM franchise_cache WHERE job_id <> ?', [jobId]);

    const completionUpdate = {
      status: 'completed' as const,
      finished_at: new Date(),
      processed_count: processedCount,
      ...(totalCountSet ? {} : { total_count: processedCount }),
    };
    await supabase.from('franchise_import_jobs').update(completionUpdate).eq('id', jobId);
  } catch (error) {
    console.error('Failed to import franchise data', error);
    await supabase.query('DELETE FROM franchise_cache WHERE job_id = ?', [jobId]).catch(() => null);
    await supabase
      .from('franchise_import_jobs')
      .update({
        status: 'failed',
        finished_at: new Date(),
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq('id', jobId);
  }
}
