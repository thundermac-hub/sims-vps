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

const normaliseOutlet = (value: unknown): FranchiseOutletSummary | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const idRaw = record.id ?? record.oid ?? null;
  const nameRaw = record.name ?? record.outlet_name ?? null;
  const id = typeof idRaw === 'string' ? idRaw.trim() || null : typeof idRaw === 'number' ? String(idRaw) : null;
  const name =
    typeof nameRaw === 'string' ? nameRaw.trim() || null : typeof nameRaw === 'number' ? String(nameRaw) : null;
  if (!id && !name) {
    return null;
  }
  return { id, name };
};

const parseOutletList = (value: unknown): FranchiseOutletSummary[] => {
  if (!value) {
    return [];
  }
  let raw = value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse cached outlet list', error);
      return [];
    }
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(normaliseOutlet).filter((entry): entry is FranchiseOutletSummary => Boolean(entry));
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
    .select('fid, franchise_name, outlets_json, outlet_count, import_index', { count: 'exact' })
    .eq('is_active', true)
    .gte('outlet_count', 1)
    .order('import_index', { ascending: false })
    .range(offset, offset + safePerPage - 1);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const franchises = rows.map((row) => ({
    fid: row.fid ?? null,
    name: row.franchise_name ?? null,
    outlets: parseOutletList(row.outlets_json),
  }));

  return {
    franchises,
    totalCount: typeof count === 'number' ? count : 0,
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
        await supabase.from('franchise_import_jobs').update({ total_count: response.totalCount }).eq('id', jobId);
      }
      if (response.rows.length > 0) {
        const cacheRows = response.rows.map((franchise) => {
          const summary = toFranchiseSummary(franchise) ?? { fid: null, name: null, outlets: [] };
          const franchiseJson = JSON.stringify(franchise ?? null) ?? 'null';
          return {
            fid: summary.fid,
            franchise_name: summary.name,
            outlets_json: JSON.stringify(summary.outlets),
            franchise_json: franchiseJson,
            outlet_count: summary.outlets.length,
            import_index: importIndex++,
            job_id: jobId,
            is_active: 0,
          };
        });
        await supabase.from('franchise_cache').insert(cacheRows);
        processedCount += cacheRows.length;
        await supabase.from('franchise_import_jobs').update({ processed_count: processedCount }).eq('id', jobId);
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

    await supabase
      .from('franchise_import_jobs')
      .update({
        status: 'completed',
        finished_at: new Date(),
        processed_count: processedCount,
        total_count: processedCount,
      })
      .eq('id', jobId);
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
