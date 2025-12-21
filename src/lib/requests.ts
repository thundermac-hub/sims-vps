import { getSupabaseAdminClient } from './db';
import { env } from './env';
import { uploadAttachment, getAttachmentUrl } from './storage';
import { createClickUpTask, fetchClickUpTaskStatus, isClickUpEnabled } from './clickup';
import type { ClickUpTaskResult } from './clickup';
import { fetchFranchiseOutlet } from './franchise';
import { ensureCsatTokenForRequest } from './csat';

export type RequestStatus = 'Open' | 'In Progress' | 'Pending Customer' | 'Resolved';

export interface SupportRequestInput {
  merchantName: string;
  outletName: string;
  phoneNumber: string;
  email: string | null;
  fid: string;
  oid: string;
  issueType: string;
  issueSubcategory1: string;
  issueSubcategory2: string | null;
  issueDescription: string;
  attachments: (File | null)[];
}

export interface SupportRequestRow {
  id: number;
  merchant_name: string;
  outlet_name: string;
  phone_number: string;
  email: string | null;
  fid: string;
  oid: string;
  issue_type: string;
  issue_subcategory1: string | null;
  issue_subcategory2: string | null;
  issue_description: string;
  ticket_description: string | null;
  clickup_link: string | null;
  clickup_task_id: string | null;
  clickup_task_status: string | null;
  clickup_task_status_synced_at: Date | null;
  attachment_url: string | null;
  attachment_url_2: string | null;
  attachment_url_3: string | null;
  status: RequestStatus;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
  ms_pic_user_id: number | null;
  hidden: boolean;
  franchise_name_resolved: string | null;
  outlet_name_resolved: string | null;
}

type ClickUpRequestRow = Pick<
  SupportRequestRow,
  | 'id'
  | 'merchant_name'
  | 'outlet_name'
  | 'phone_number'
  | 'email'
  | 'fid'
  | 'oid'
  | 'issue_type'
  | 'issue_description'
  | 'clickup_link'
  | 'clickup_task_id'
  | 'clickup_task_status'
>;

type ClickUpStatusRow = Pick<SupportRequestRow, 'clickup_task_id' | 'clickup_link' | 'clickup_task_status'>;

export interface RequestFilters {
  status?: RequestStatus;
  query?: string;
  from?: string;
  to?: string;
  hasClickUp?: boolean;
  includeArchived?: boolean;
  archivedOnly?: boolean;
}

export interface CreateSupportRequestResult {
  id: number;
  attachmentKeys: (string | null)[];
}

export async function createSupportRequest(input: SupportRequestInput): Promise<CreateSupportRequestResult> {
  const supabase = getSupabaseAdminClient();
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const attachmentKeys: (string | null)[] = [];
  for (let index = 0; index < 3; index += 1) {
    const file = attachments[index] ?? null;
    if (!file) {
      attachmentKeys.push(null);
      continue;
    }
    const mime = file.type || 'application/octet-stream';
    if (!env.allowedMimeTypes.includes(mime)) {
      throw new Error('Unsupported file type');
    }
    if (file.size > env.maxUploadBytes) {
      throw new Error('File exceeds maximum allowed size');
    }
    const uploadedKey = await uploadAttachment(file);
    attachmentKeys.push(uploadedKey);
  }

  const phoneDigits = normalisePhone(input.phoneNumber);
  const nowStatus: RequestStatus = 'Open';
  const [attachmentPrimary, attachmentSecondary, attachmentTertiary] = attachmentKeys;
  const outletName = input.outletName?.trim() || 'N/A';

  const { data, error } = await supabase
    .from<{ id: number }>('support_requests')
    .insert({
      merchant_name: input.merchantName,
      outlet_name: outletName,
      phone_number: phoneDigits,
      email: input.email,
      fid: input.fid,
      oid: input.oid,
      issue_type: input.issueType,
      issue_subcategory1: input.issueSubcategory1,
      issue_subcategory2: input.issueSubcategory2,
      issue_description: input.issueDescription,
      attachment_url: attachmentPrimary,
      attachment_url_2: attachmentSecondary,
      attachment_url_3: attachmentTertiary,
      status: nowStatus,
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }
  if (!data || typeof data.id !== 'number') {
    throw new Error('Failed to create support request (no id returned)');
  }

  return {
    id: data.id,
    attachmentKeys,
  };
}

export interface FetchRequestsOptions {
  limit?: number;
  offset?: number;
  withCount?: boolean;
}

export interface FetchRequestsResult {
  rows: SupportRequestRow[];
  count: number | null;
}

export type SupportRequestWithAttachment = SupportRequestRow & { attachmentDownloadUrls: string[] };
type FranchiseLookupResult = Awaited<ReturnType<typeof fetchFranchiseOutlet>>;

export async function fetchRequests(
  filters: RequestFilters,
  options: FetchRequestsOptions = {},
): Promise<FetchRequestsResult> {
  const { limit = 200, offset = 0, withCount = false } = options;
  const supabase = getSupabaseAdminClient();
  const selectColumnsWithFranchise = [
    'id',
    'merchant_name',
    'outlet_name',
    'phone_number',
    'email',
    'fid',
    'oid',
    'issue_type',
    'issue_subcategory1',
    'issue_subcategory2',
    'issue_description',
    'ticket_description',
    'clickup_link',
    'clickup_task_id',
    'clickup_task_status',
    'clickup_task_status_synced_at',
    'attachment_url',
    'attachment_url_2',
    'attachment_url_3',
    'status',
    'closed_at',
    'updated_by',
    'ms_pic_user_id',
    'hidden',
    'franchise_name_resolved',
    'outlet_name_resolved',
    'created_at',
    'updated_at',
  ].join(', ');

  const selectColumnsFallback = [
    'id',
    'merchant_name',
    'outlet_name',
    'phone_number',
    'email',
    'fid',
    'oid',
    'issue_type',
    'issue_subcategory1',
    'issue_subcategory2',
    'issue_description',
    'ticket_description',
    'clickup_link',
    'clickup_task_id',
    'clickup_task_status',
    'clickup_task_status_synced_at',
    'attachment_url',
    'attachment_url_2',
    'attachment_url_3',
    'status',
    'closed_at',
    'updated_by',
    'ms_pic_user_id',
    'hidden',
    'created_at',
    'updated_at',
  ].join(', ');

  const selectColumnsLegacy = [
    'id',
    'merchant_name',
    'outlet_name',
    'phone_number',
    'email',
    'fid',
    'oid',
    'issue_type',
    'issue_subcategory1',
    'issue_subcategory2',
    'issue_description',
    'ticket_description',
    'clickup_link',
    'clickup_task_id',
    'clickup_task_status',
    'clickup_task_status_synced_at',
    'attachment_url',
    'attachment_url_2',
    'attachment_url_3',
    'status',
    'closed_at',
    'updated_by',
    'ms_pic_user_id',
    'created_at',
    'updated_at',
  ].join(', ');

  const buildQuery = (selectColumns: string) =>
    supabase.from('support_requests').select(selectColumns, { count: withCount ? 'exact' : undefined }).order('created_at', {
      ascending: false,
    });

  let queryBuilder = buildQuery(selectColumnsWithFranchise);

  if (limit > 0) {
    queryBuilder = queryBuilder.range(offset, offset + limit - 1);
  }

  if (filters.status) {
    queryBuilder = queryBuilder.eq('status', filters.status);
  }
  if (filters.from) {
    const dayStart = toStartOfDay(filters.from);
    queryBuilder = queryBuilder.gte('created_at', dayStart);
  }
  if (filters.to) {
    const dayEnd = toEndOfDay(filters.to);
    queryBuilder = queryBuilder.lte('created_at', dayEnd);
  }
  if (filters.query) {
    const pattern = `%${escapeLike(filters.query.replace(/,/g, ' '))}%`;
    const orFilters = [
      `merchant_name.ilike.${pattern}`,
      `outlet_name.ilike.${pattern}`,
      `phone_number.ilike.${pattern}`,
      `issue_type.ilike.${pattern}`,
      `issue_description.ilike.${pattern}`,
      `issue_subcategory1.ilike.${pattern}`,
      `issue_subcategory2.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `fid.ilike.${pattern}`,
      `oid.ilike.${pattern}`,
    ];
    queryBuilder = queryBuilder.or(orFilters.join(','));
  }
  if (filters.hasClickUp === true) {
    queryBuilder = queryBuilder.not('clickup_link', 'is', null);
  }
  if (filters.hasClickUp === false) {
    queryBuilder = queryBuilder.is('clickup_link', null);
  }
  if (filters.includeArchived) {
    if (filters.archivedOnly) {
      queryBuilder = queryBuilder.eq('hidden', true);
    }
  } else {
    queryBuilder = queryBuilder.eq('hidden', false);
  }

  const executeQuery = async (qb: typeof queryBuilder) => {
    const { data, error, count } = await qb;
    if (error) {
      throw error;
    }
    return { data, count };
  };

  let data: unknown[] | null = null;
  let count: number | null | undefined = null;
  try {
    const result = await executeQuery(queryBuilder);
    data = result.data as unknown[];
    count = result.count;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703') {
      // Backward compatibility for databases without the "hidden" column
      const fallbackQuery = buildQuery(selectColumnsFallback);
      const result = await executeQuery(fallbackQuery);
      data = result.data as unknown[];
      count = result.count;
    } else {
      throw error;
    }
  }

  if (!data) {
    return { rows: [], count: count ?? null };
  }

  const rows = data as unknown as SupabaseSupportRequest[];
  return {
    rows: rows.map(mapSupabaseRow),
    count: count ?? null,
  };
}

export async function fetchRequestsWithSignedUrls(
  filters: RequestFilters,
  options: FetchRequestsOptions = {},
): Promise<{ rows: SupportRequestWithAttachment[]; count: number | null }> {
  const { rows, count } = await fetchRequests(filters, options);
  const augmented = await Promise.all(
    rows.map(async (row) => {
      const attachmentKeys = [row.attachment_url, row.attachment_url_2, row.attachment_url_3];
      const urls = await Promise.all(
        attachmentKeys.map(async (key) => {
          if (!key) return null;
          try {
            return await getAttachmentUrl(key);
          } catch (error) {
            console.warn('Failed to fetch attachment URL', key, error);
            return null;
          }
        }),
      );
      const attachmentDownloadUrls = urls.filter((value): value is string => Boolean(value));
      return { ...row, attachmentDownloadUrls };
    }),
  );
  return { rows: augmented, count };
}

export async function fetchRequestByIdWithSignedUrl(id: number): Promise<SupportRequestWithAttachment | null> {
  const supabase = getSupabaseAdminClient();
  const selectColumns = [
    'id',
    'merchant_name',
    'outlet_name',
    'phone_number',
    'email',
    'fid',
    'oid',
    'issue_type',
    'issue_subcategory1',
    'issue_subcategory2',
    'issue_description',
    'ticket_description',
    'clickup_link',
    'clickup_task_id',
    'clickup_task_status',
    'clickup_task_status_synced_at',
    'attachment_url',
    'attachment_url_2',
    'attachment_url_3',
    'status',
    'closed_at',
    'updated_by',
    'ms_pic_user_id',
    'hidden',
    'franchise_name_resolved',
    'outlet_name_resolved',
    'created_at',
    'updated_at',
  ].join(', ');

  const selectColumnsFallback = [
    'id',
    'merchant_name',
    'outlet_name',
    'phone_number',
    'email',
    'fid',
    'oid',
    'issue_type',
    'issue_subcategory1',
    'issue_subcategory2',
    'issue_description',
    'ticket_description',
    'clickup_link',
    'clickup_task_id',
    'clickup_task_status',
    'clickup_task_status_synced_at',
    'attachment_url',
    'attachment_url_2',
    'attachment_url_3',
    'status',
    'closed_at',
    'updated_by',
    'ms_pic_user_id',
    'hidden',
    'created_at',
    'updated_at',
  ].join(', ');

  const runQuery = async (cols: string) =>
    supabase
      .from('support_requests')
      .select(cols)
      .eq('id', id)
      .single();

  let data: unknown | null = null;
  try {
    const result = await runQuery(selectColumns);
    data = result.data;
  } catch (error) {
    if ('code' in (error as { code?: string }) && (error as { code?: string }).code === '42703') {
      const fallback = await runQuery(selectColumnsFallback);
      data = fallback.data;
    } else if ('code' in (error as { code?: string }) && (error as { code?: string }).code === 'PGRST116') {
      return null;
    } else {
      throw error;
    }
  }

  if (!data) {
    return null;
  }

  const mapped = mapSupabaseRow(data as unknown as SupabaseSupportRequest);
  const attachmentKeys = [mapped.attachment_url, mapped.attachment_url_2, mapped.attachment_url_3];
  const urls = await Promise.all(
    attachmentKeys.map(async (key) => {
      if (!key) return null;
      try {
        return await getAttachmentUrl(key);
      } catch (error) {
        console.warn('Failed to fetch attachment URL by id', key, error);
        return null;
      }
    }),
  );
  const attachmentDownloadUrls = urls.filter((value): value is string => Boolean(value));
  return { ...mapped, attachmentDownloadUrls };
}

export interface SupportRequestUpdateInput {
  merchantName: string;
  outletName: string;
  phoneNumber: string;
  email: string | null;
  fid: string;
  oid: string;
  issueType: string;
  issueSubcategory1: string | null;
  issueSubcategory2: string | null;
  issueDescription: string;
  ticketDescription: string | null;
  status: RequestStatus;
  clickupLink: string | null;
  msPicUserId: number | null;
  franchiseResolved?: string | null;
  outletResolved?: string | null;
  hidden?: boolean;
}

export async function updateSupportRequestDetails(
  id: number,
  input: SupportRequestUpdateInput,
  updatedBy: string | number | null,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const existingRecord = await fetchRequestByIdRaw(id);
  const before: HistoryPayload | null = existingRecord
    ? {
        merchant_name: existingRecord.merchant_name,
        outlet_name: existingRecord.outlet_name,
        phone_number: existingRecord.phone_number,
        email: existingRecord.email,
        fid: existingRecord.fid,
        oid: existingRecord.oid,
        issue_type: existingRecord.issue_type,
        issue_subcategory1: existingRecord.issue_subcategory1,
        issue_subcategory2: existingRecord.issue_subcategory2,
        issue_description: existingRecord.issue_description,
        ticket_description: existingRecord.ticket_description,
        status: existingRecord.status,
        clickup_link: existingRecord.clickup_link,
        clickup_task_id: existingRecord.clickup_task_id,
        clickup_task_status: existingRecord.clickup_task_status,
        closed_at: existingRecord.closed_at ?? null,
        ms_pic_user_id: existingRecord.ms_pic_user_id,
        franchise_name_resolved: existingRecord.franchise_name_resolved,
        outlet_name_resolved: existingRecord.outlet_name_resolved,
        hidden: existingRecord.hidden,
      }
    : null;

  const wasResolved = existingRecord?.status === 'Resolved';
  const existingClosedAt = existingRecord?.closed_at ?? null;
  let closedAt: Date | null = existingClosedAt ? new Date(existingClosedAt) : null;
  if (input.status === 'Resolved' && !closedAt) {
    closedAt = new Date();
  } else if (!wasResolved && input.status !== 'Resolved') {
    closedAt = existingClosedAt ? new Date(existingClosedAt) : null;
  }

  const payload: Record<string, unknown> = {
    merchant_name: input.merchantName,
    outlet_name: input.outletName,
    phone_number: input.phoneNumber,
    email: input.email,
    fid: input.fid,
    oid: input.oid,
    issue_type: input.issueType,
    issue_subcategory1: input.issueSubcategory1,
    issue_subcategory2: input.issueSubcategory2,
    issue_description: input.issueDescription,
    ticket_description: input.ticketDescription,
    status: input.status,
    clickup_link: input.clickupLink,
    closed_at: closedAt,
    ms_pic_user_id: input.msPicUserId,
    updated_by: updatedBy,
    updated_at: new Date(),
    franchise_name_resolved: input.franchiseResolved ?? null,
    outlet_name_resolved: input.outletResolved ?? null,
  };

  const { error } = await supabase.from('support_requests').update(payload).eq('id', id);
  if (error) {
    throw error;
  }

  if (input.status === 'Resolved' && !wasResolved) {
    try {
      await ensureCsatTokenForRequest(id, closedAt);
    } catch (error) {
      console.warn('Failed to generate CSAT link after resolution', error);
    }
  }

  const after: HistoryPayload = {
    merchant_name: input.merchantName,
    outlet_name: input.outletName,
    phone_number: input.phoneNumber,
    email: input.email,
    fid: input.fid,
    oid: input.oid,
    issue_type: input.issueType,
    issue_subcategory1: input.issueSubcategory1,
    issue_subcategory2: input.issueSubcategory2,
    issue_description: input.issueDescription,
    ticket_description: input.ticketDescription,
    status: input.status,
    clickup_link: input.clickupLink,
    clickup_task_id: existingRecord?.clickup_task_id ?? null,
    clickup_task_status: existingRecord?.clickup_task_status ?? null,
    closed_at: closedAt,
    ms_pic_user_id: input.msPicUserId,
    franchise_name_resolved: input.franchiseResolved ?? null,
    outlet_name_resolved: input.outletResolved ?? null,
    hidden: existingRecord?.hidden ?? false,
  };
  await recordHistoryDiff(id, before, after, updatedBy);
}

export async function hideSupportRequest(id: number, updatedBy: string | number | null, hidden = true): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const existing = await fetchRequestByIdRaw(id);
  if (!existing) {
    return;
  }

  const { error } = await supabase
    .from('support_requests')
    .update({ hidden, updated_by: updatedBy, updated_at: new Date() })
    .eq('id', id);
  if (error) {
    throw error;
  }

  try {
    const after: HistoryPayload = { ...existing, hidden };
    await recordHistoryDiff(id, existing, after, updatedBy);
  } catch (historyError) {
    console.warn('Failed to record history for hide/unhide', historyError);
  }
}

export async function recordCsatWhatsappSent(id: number, changedBy: string | number | null): Promise<void> {
  const supabase = getSupabaseAdminClient();
  try {
    const { data: existing, error: existingError } = await supabase
      .from('support_request_history')
      .select('id')
      .eq('request_id', id)
      .eq('field_name', 'csat_whatsapp_sent')
      .eq('new_value', 'true')
      .limit(1)
      .maybeSingle();
    if (existingError && (existingError as { code?: string }).code !== 'PGRST116') {
      throw existingError;
    }
    if (existing) {
      return;
    }
  } catch (error) {
    console.warn('Failed to check CSAT WhatsApp history', error);
  }

  const payload = {
    request_id: id,
    field_name: 'csat_whatsapp_sent',
    old_value: null,
    new_value: 'true',
    changed_by: changedBy === null || changedBy === undefined ? null : String(changedBy),
  };

  try {
    await supabase.from('support_request_history').insert(payload);
  } catch (error) {
    console.warn('Failed to record CSAT WhatsApp send', error);
  }
}

export async function storeFranchiseOutletResolution(
  id: number,
  franchiseName: string | null,
  outletName: string | null,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = {
    franchise_name_resolved: franchiseName,
    outlet_name_resolved: outletName,
  };
  const { error } = await supabase.from('support_requests').update(payload).eq('id', id);
  if (error) {
    if ('code' in error && (error as { code?: string }).code === '42703') {
      console.warn('Franchise columns missing; skipping storeFranchiseOutletResolution');
      return;
    }
    throw error;
  }
}

export async function updateRequestStatus(id: number, status: RequestStatus, updatedBy: string | null) {
  const supabase = getSupabaseAdminClient();
  if (!['Open', 'In Progress', 'Pending Customer', 'Resolved'].includes(status)) {
    throw new Error('Invalid status');
  }
  const { error } = await supabase
    .from('support_requests')
    .update({
      status,
      updated_by: updatedBy,
      updated_at: new Date(),
    })
    .eq('id', id);
  if (error) {
    throw error;
  }
}

export async function buildExportCsv(filters: RequestFilters): Promise<string> {
  const { rows } = await fetchRequests(filters, { limit: 10_000 });
  const franchiseLookup = await buildFranchiseLookup(rows);
  const closingActors = await fetchClosingActors(rows.map((row) => row.id));
  const userDisplayMaps = await buildUserDisplayMaps(rows, Array.from(closingActors.values()));
  const csatWhatsappSentMap = await fetchCsatWhatsappSent(rows.map((row) => row.id));
  const csatResponses = await fetchCsatResponsesByRequest(rows.map((row) => row.id));
  const columns: Array<{ label: string; value: (row: ExportRow) => unknown }> = [
    { label: 'Ticket ID', value: (row) => row.id },
    { label: 'Merchant Name', value: (row) => row.merchant_name },
    { label: 'Franchise Name', value: (row) => row.franchise_name },
    { label: 'Outlet Name', value: (row) => row.outlet_name },
    { label: 'Phone Number', value: (row) => row.phone_number },
    { label: 'FID', value: (row) => row.fid },
    { label: 'OID', value: (row) => row.oid },
    { label: 'Issue Type', value: (row) => row.issue_type },
    { label: 'Issue Subcategory 1', value: (row) => row.issue_subcategory1 },
    { label: 'Issue Subcategory 2', value: (row) => row.issue_subcategory2 },
    { label: 'Issue Description', value: (row) => row.issue_description },
    { label: 'Ticket Notes', value: (row) => row.ticket_description },
    { label: 'ClickUp Link', value: (row) => row.clickup_link },
    { label: 'ClickUp Task ID', value: (row) => row.clickup_task_id },
    { label: 'ClickUp Status', value: (row) => row.clickup_task_status },
    { label: 'ClickUp Status Synced At', value: (row) => row.clickup_task_status_synced_at_formatted },
    { label: 'Status', value: (row) => row.status },
    { label: 'Closed By', value: (row) => row.closed_by_display },
    { label: 'Closed At', value: (row) => row.closed_at_formatted },
    { label: 'Assigned MS PIC', value: (row) => row.ms_pic_display },
    { label: 'Created At', value: (row) => row.created_at_formatted },
    { label: 'CSAT WhatsApp Sent', value: (row) => (row.csat_whatsapp_sent ? 'True' : 'False') },
    { label: 'CSAT Support Score', value: (row) => row.csat_support_score },
    { label: 'CSAT Support Comment', value: (row) => row.csat_support_comment },
    { label: 'CSAT Product Score', value: (row) => row.csat_product_score },
    { label: 'CSAT Product Feedback', value: (row) => row.csat_product_feedback },
  ];

  const lines = rows.map((row) => {
    const exportRow = mapExportRow(
      row,
      franchiseLookup,
      userDisplayMaps,
      csatResponses,
      closingActors,
      csatWhatsappSentMap,
    );
    return columns.map((column) => csvEscape(column.value(exportRow))).join(',');
  });

  return [columns.map((column) => column.label).join(','), ...lines].join('\n');
}

type ExportUserMaps = {
  displayById: Map<number, string>;
  displayByEmail: Map<string, string>;
};

type ExportCsatResponse = {
  support_score: string;
  support_reason: string | null;
  product_score: string;
  product_feedback: string | null;
};

type ExportRow = SupportRequestRow & {
  franchise_name: string;
  outlet_name: string;
  created_at_formatted: string;
  updated_at_formatted: string;
  closed_at_formatted: string;
  clickup_task_status_synced_at_formatted: string;
  updated_by_display: string;
  closed_by_display: string;
  ms_pic_display: string;
  csat_whatsapp_sent: boolean;
  csat_support_score: string;
  csat_support_comment: string;
  csat_product_score: string;
  csat_product_feedback: string;
};

function mapExportRow(
  row: SupportRequestRow,
  franchiseLookup: Map<string, FranchiseLookupResult | null>,
  userDisplayMaps: ExportUserMaps,
  csatResponses: Map<number, ExportCsatResponse>,
  closingActors: Map<number, string | number | null>,
  csatWhatsappSentMap: Map<number, boolean>,
): ExportRow {
  const lookup =
    row.fid && row.oid ? franchiseLookup.get(buildFranchiseLookupKey(row.fid, row.oid)) ?? null : null;
  const dbFranchise = row.franchise_name_resolved?.trim() || null;
  const dbOutlet = row.outlet_name_resolved?.trim() || null;
  const resolvedFranchise =
    dbFranchise ?? (lookup && lookup.found ? lookup.franchiseName ?? null : null) ?? NO_OUTLET_FOUND;
  const resolvedOutlet =
    dbOutlet ??
    (lookup && lookup.found ? lookup.outletName ?? null : null) ??
    row.outlet_name ??
    NO_OUTLET_FOUND;
  const csatFields = formatCsatResponseForExport(csatResponses.get(row.id) ?? null);
  const updatedByDisplay = resolveUserDisplayForExport(row.updated_by, userDisplayMaps) ?? '';
  const msPicDisplay =
    row.ms_pic_user_id != null ? resolveUserDisplayForExport(row.ms_pic_user_id, userDisplayMaps) ?? '' : '';
  const closedByIdentifier = closingActors.get(row.id) ?? null;
  const closedByDisplay = closedByIdentifier
    ? resolveUserDisplayForExport(closedByIdentifier, userDisplayMaps) ?? ''
    : '';
  const csatWhatsappSent = csatWhatsappSentMap.get(row.id) ?? false;

  return {
    ...row,
    franchise_name: resolvedFranchise ?? '',
    outlet_name: resolvedOutlet ?? '',
    created_at_formatted: formatDateTimeForExport(row.created_at),
    updated_at_formatted: formatDateTimeForExport(row.updated_at),
    closed_at_formatted: formatDateTimeForExport(row.closed_at),
    clickup_task_status_synced_at_formatted: formatDateTimeForExport(row.clickup_task_status_synced_at),
    updated_by_display: updatedByDisplay,
    closed_by_display: closedByDisplay,
    ms_pic_display: msPicDisplay,
    csat_whatsapp_sent: csatWhatsappSent,
    csat_support_score: csatFields.supportScore,
    csat_support_comment: csatFields.supportComment,
    csat_product_score: csatFields.productScore,
    csat_product_feedback: csatFields.productFeedback,
  };
}

function formatUserNameFromEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@')) {
    return null;
  }
  const [localPart] = trimmed.split('@');
  const words = localPart.replace(/[\.\-_]+/g, ' ').split(' ').filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function buildUserLabel(user: { id?: number | null; email?: string | null; name?: string | null }): string {
  const name = (user.name ?? '').trim();
  if (name) {
    return name;
  }
  const formatted = formatUserNameFromEmail(user.email);
  if (formatted) {
    return formatted;
  }
  const email = (user.email ?? '').trim();
  if (email) {
    return email;
  }
  const id = Number(user.id);
  if (Number.isFinite(id)) {
    return `User #${id}`;
  }
  return 'User';
}

async function buildUserDisplayMaps(
  rows: SupportRequestRow[],
  extraIdentifiers: Array<string | number | null> = [],
): Promise<ExportUserMaps> {
  const ids = new Set<number>();
  const emails = new Set<string>();

  rows.forEach((row) => {
    if (typeof row.ms_pic_user_id === 'number' && Number.isFinite(row.ms_pic_user_id)) {
      ids.add(row.ms_pic_user_id);
    }
    const updated = row.updated_by;
    if (updated !== null && updated !== undefined) {
      const numeric = Number(updated);
      if (Number.isFinite(numeric)) {
        ids.add(numeric);
      } else if (typeof updated === 'string') {
        const normalisedEmail = updated.trim().toLowerCase();
        if (normalisedEmail && normalisedEmail.includes('@')) {
          emails.add(normalisedEmail);
        }
      }
    }
  });

  extraIdentifiers.forEach((identifier) => {
    if (identifier === null || identifier === undefined) {
      return;
    }
    const numeric = Number(identifier);
    if (Number.isFinite(numeric)) {
      ids.add(numeric);
      return;
    }
    const raw = String(identifier).trim().toLowerCase();
    if (raw && raw.includes('@')) {
      emails.add(raw);
    }
  });

  const displayById = new Map<number, string>();
  const displayByEmail = new Map<string, string>();
  if (ids.size === 0 && emails.size === 0) {
    return { displayById, displayByEmail };
  }

  const supabase = getSupabaseAdminClient();
  const users: { id: number; email: string | null; name: string | null }[] = [];

  const idList = Array.from(ids);
  if (idList.length > 0) {
    const { data, error } = await supabase.from('users').select('id, email, name').in('id', idList);
    if (error) {
      console.warn('Failed to load users for export by id', error);
    } else if (data) {
      users.push(...(data as { id: number; email: string | null; name: string | null }[]));
    }
  }

  const emailList = Array.from(emails);
  if (emailList.length > 0) {
    const { data, error } = await supabase.from('users').select('id, email, name').in('email', emailList);
    if (error) {
      console.warn('Failed to load users for export by email', error);
    } else if (data) {
      users.push(...(data as { id: number; email: string | null; name: string | null }[]));
    }
  }

  users.forEach((user) => {
    const label = buildUserLabel(user);
    const id = Number(user.id);
    if (Number.isFinite(id)) {
      displayById.set(id, label);
    }
    const email = (user.email ?? '').trim().toLowerCase();
    if (email) {
      displayByEmail.set(email, label);
    }
  });

  return { displayById, displayByEmail };
}

function resolveUserDisplayForExport(
  identifier: string | number | null,
  maps: ExportUserMaps,
  options: { fallbackLabel?: string } = {},
): string | null {
  if (identifier === null || identifier === undefined) {
    return options.fallbackLabel ?? null;
  }
  const fallbackLabel = options.fallbackLabel;
  const numeric = Number(identifier);
  if (Number.isFinite(numeric)) {
    if (maps.displayById.has(numeric)) {
      return maps.displayById.get(numeric) ?? fallbackLabel ?? null;
    }
    return fallbackLabel ?? `User #${numeric}`;
  }
  const raw = String(identifier).trim();
  if (!raw) {
    return fallbackLabel ?? null;
  }
  const email = raw.toLowerCase();
  if (maps.displayByEmail.has(email)) {
    return maps.displayByEmail.get(email) ?? fallbackLabel ?? null;
  }
  const formatted = formatUserNameFromEmail(raw);
  if (formatted) {
    return formatted;
  }
  return raw || fallbackLabel || null;
}

async function fetchCsatResponsesByRequest(requestIds: number[]): Promise<Map<number, ExportCsatResponse>> {
  const ids = Array.from(new Set(requestIds.filter((value) => Number.isFinite(value)))) as number[];
  const map = new Map<number, ExportCsatResponse>();
  if (ids.length === 0) {
    return map;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('csat_responses')
    .select('request_id, support_score, support_reason, product_score, product_feedback, submitted_at')
    .in('request_id', ids)
    .order('submitted_at', { ascending: false });

  if (error || !data) {
    if (error && (error as { code?: string }).code !== '42P01') {
      console.warn('Failed to fetch CSAT responses for export', error);
    }
    return map;
  }

  const seen = new Set<number>();
  (data as {
    request_id: number;
    support_score: string;
    support_reason: string | null;
    product_score: string;
    product_feedback: string | null;
  }[]).forEach((row) => {
    const requestId = Number(row.request_id);
    if (!Number.isFinite(requestId) || seen.has(requestId)) {
      return;
    }
    seen.add(requestId);
    map.set(requestId, {
      support_score: row.support_score,
      support_reason: row.support_reason,
      product_score: row.product_score,
      product_feedback: row.product_feedback,
    });
  });

  return map;
}

async function fetchCsatWhatsappSent(requestIds: number[]): Promise<Map<number, boolean>> {
  const ids = Array.from(new Set(requestIds.filter((value) => Number.isFinite(value)))) as number[];
  const map = new Map<number, boolean>();
  if (ids.length === 0) {
    return map;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('support_request_history')
    .select('request_id')
    .in('request_id', ids)
    .eq('field_name', 'csat_whatsapp_sent')
    .eq('new_value', 'true');

  if (error || !data) {
    if (error && (error as { code?: string }).code !== '42P01') {
      console.warn('Failed to fetch CSAT WhatsApp history', error);
    }
    return map;
  }

  (data as { request_id: number }[]).forEach((row) => {
    const requestId = Number(row.request_id);
    if (Number.isFinite(requestId)) {
      map.set(requestId, true);
    }
  });

  return map;
}

async function fetchClosingActors(requestIds: number[]): Promise<Map<number, string | number | null>> {
  const ids = Array.from(new Set(requestIds.filter((value) => Number.isFinite(value)))) as number[];
  const map = new Map<number, string | number | null>();
  if (ids.length === 0) {
    return map;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('support_request_history')
    .select('request_id, changed_by, changed_at, new_value, field_name')
    .in('request_id', ids)
    .eq('field_name', 'status')
    .eq('new_value', 'Resolved')
    .order('changed_at', { ascending: false });

  if (error || !data) {
    if (error && (error as { code?: string }).code !== '42P01') {
      console.warn('Failed to fetch closing actors for export', error);
    }
    return map;
  }

  (data as { request_id: number; changed_by: string | null }[]).forEach((row) => {
    const requestId = Number(row.request_id);
    if (!Number.isFinite(requestId)) {
      return;
    }
    if (!map.has(requestId)) {
      map.set(requestId, row.changed_by ?? null);
    }
  });

  return map;
}

function formatCsatResponseForExport(response: ExportCsatResponse | null): {
  supportScore: string;
  supportComment: string;
  productScore: string;
  productFeedback: string;
} {
  if (!response) {
    return { supportScore: '', supportComment: '', productScore: '', productFeedback: '' };
  }
  const supportComment = response.support_reason?.trim() ?? '';
  const productComment = response.product_feedback?.trim() ?? '';
  return {
    supportScore: response.support_score || '',
    supportComment,
    productScore: response.product_score || '',
    productFeedback: productComment,
  };
}

export function normalisePhone(value: string): string {
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) {
    return '';
  }
  if (digitsOnly.startsWith('6')) {
    return digitsOnly;
  }
  return `6${digitsOnly}`;
}

export function buildWhatsAppUrl(data: {
  merchantName: string;
  outletName: string;
  phoneNumber: string;
  email?: string | null;
  fid?: string | null;
  oid?: string | null;
  issueType: string;
  issueSubcategory1?: string | null;
  issueSubcategory2?: string | null;
  issueDescription: string;
  requestId: number;
}): string {
  const lines = [
    'New Support Request',
    `Merchant: ${data.merchantName}`,
    `Outlet: ${data.outletName || 'N/A'}`,
    `Phone: ${data.phoneNumber}`,
    data.email ? `Email: ${data.email}` : null,
    data.fid ? `FID: ${data.fid}` : null,
    data.oid ? `OID: ${data.oid}` : null,
    `Category: ${data.issueType}`,
    data.issueSubcategory1 ? `Subcategory 1: ${data.issueSubcategory1}` : null,
    data.issueSubcategory2 ? `Subcategory 2: ${data.issueSubcategory2}` : null,
    `Description: ${data.issueDescription}`,
    `Request ID: #${data.requestId}`,
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join('\n\n'));
  return `https://wa.me/${env.whatsappPhone}?text=${text}`;
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

type SupabaseSupportRequest = {
  id: number;
  merchant_name: string;
  outlet_name: string;
  phone_number: string;
  email: string | null;
  fid: string;
  oid: string;
  issue_type: string;
  issue_subcategory1: string | null;
  issue_subcategory2: string | null;
  issue_description: string;
  ticket_description: string | null;
  clickup_link: string | null;
  clickup_task_id: string | null;
  clickup_task_status: string | null;
  clickup_task_status_synced_at: string | null;
  attachment_url: string | null;
  attachment_url_2: string | null;
  attachment_url_3: string | null;
  status: RequestStatus;
  closed_at?: string | null;
  updated_by: string | null;
  ms_pic_user_id: number | null;
  hidden: boolean;
  franchise_name_resolved?: string | null;
  outlet_name_resolved?: string | null;
  created_at: string;
  updated_at: string;
};

function mapSupabaseRow(row: SupabaseSupportRequest): SupportRequestRow {
  return {
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    closed_at: row.closed_at ? new Date(row.closed_at) : null,
    clickup_task_status_synced_at: row.clickup_task_status_synced_at
      ? new Date(row.clickup_task_status_synced_at)
      : null,
    franchise_name_resolved: row.franchise_name_resolved ?? null,
    outlet_name_resolved: row.outlet_name_resolved ?? null,
    hidden: Boolean(row.hidden),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function toStartOfDay(date: string): string {
  const { start } = toDayRangeInTimezone(date, env.timezone);
  return start;
}

function toEndOfDay(date: string): string {
  const { end } = toDayRangeInTimezone(date, env.timezone);
  return end;
}

function toDayRangeInTimezone(date: string, timeZone: string): { start: string; end: string } {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { start: `${date}T00:00:00`, end: `${date}T23:59:59.999` };
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const targetBase = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offsetMinutes = getTimezoneOffsetForDate(new Date(targetBase), timeZone);
  const startUtc = targetBase - offsetMinutes * 60 * 1000;
  const start = new Date(startUtc);
  const end = new Date(startUtc + 24 * 60 * 60 * 1000 - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

const exportDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: env.timezone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

function formatDateTimeForExport(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = exportDateFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const period = (get('dayPeriod') || '').toUpperCase();
  if (!day || !month || !year || !hour || !minute || !period) {
    return '';
  }
  return `${day}/${month}/${year} ${hour}:${minute} ${period}`;
}

function getTimezoneOffsetForDate(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const filled: Record<string, number> = {};
  parts.forEach((p) => {
    if (p.type !== 'literal') filled[p.type] = Number(p.value);
  });
  const adjusted = Date.UTC(
    filled.year,
    (filled.month ?? 1) - 1,
    filled.day ?? 1,
    filled.hour ?? 0,
    filled.minute ?? 0,
    filled.second ?? 0,
  );
  return (adjusted - date.getTime()) / (60 * 1000);
}

const NO_OUTLET_FOUND = 'No Outlet Found';

function cleanId(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\D/g, '');
}

function buildFranchiseLookupKey(fid: string, oid: string): string {
  return `${cleanId(fid)}-${cleanId(oid)}`;
}

async function buildFranchiseLookup(rows: SupportRequestRow[]): Promise<Map<string, FranchiseLookupResult | null>> {
  const map = new Map<string, FranchiseLookupResult | null>();
  const tasks: Promise<void>[] = [];
  for (const row of rows) {
    const fid = cleanId(row.fid);
    const oid = cleanId(row.oid);
    if (!fid || !oid) continue;
    const key = buildFranchiseLookupKey(fid, oid);
    if (map.has(key)) continue;
    if (row.franchise_name_resolved || row.outlet_name_resolved) {
      map.set(key, {
        franchiseName: row.franchise_name_resolved,
        outletName: row.outlet_name_resolved,
        found: true,
      });
      continue;
    }
    const task = fetchFranchiseOutlet(fid, oid)
      .then((result) => {
        map.set(key, result);
      })
      .catch((error) => {
        console.error('Franchise lookup failed during export', error);
        map.set(key, null);
      });
    tasks.push(task);
  }
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
  return map;
}

type SupportRequestHistoryInsert = {
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | number | null;
};

async function insertSupportRequestHistory(
  requestId: number,
  entries: SupportRequestHistoryInsert[],
): Promise<void> {
  if (entries.length === 0) return;
  const supabase = getSupabaseAdminClient();
  const payload = entries.map((entry) => ({
    request_id: requestId,
    field_name: entry.field_name,
    old_value: entry.old_value,
    new_value: entry.new_value,
    changed_by: entry.changed_by === null ? null : String(entry.changed_by),
  }));
  const { error } = await supabase.from('support_request_history').insert(payload);
  if (error) {
    console.warn('Failed to insert support_request_history', error);
  }
}

function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

const HISTORY_FIELDS = [
  'merchant_name',
  'outlet_name',
  'phone_number',
  'email',
  'fid',
  'oid',
  'issue_type',
  'issue_subcategory1',
  'issue_subcategory2',
  'issue_description',
  'ticket_description',
  'status',
  'clickup_link',
  'clickup_task_id',
  'clickup_task_status',
  'closed_at',
  'ms_pic_user_id',
  'franchise_name_resolved',
  'outlet_name_resolved',
  'hidden',
] as const;

type HistoryPayload = Partial<Record<(typeof HISTORY_FIELDS)[number], unknown>>;

function buildHistoryEntries(
  before: HistoryPayload,
  after: HistoryPayload,
  changedBy: string | number | null,
): SupportRequestHistoryInsert[] {
  return HISTORY_FIELDS.filter((field) => String(before[field] ?? '') !== String(after[field] ?? '')).map((field) => ({
    field_name: field,
    old_value: stringifyValue(before[field]),
    new_value: stringifyValue(after[field]),
    changed_by: changedBy,
  }));
}

async function recordHistoryDiff(
  requestId: number,
  before: HistoryPayload | null,
  after: HistoryPayload,
  changedBy: string | number | null,
): Promise<void> {
  if (!before) return;
  const entries = buildHistoryEntries(before, after, changedBy);
  if (entries.length === 0) return;
  await insertSupportRequestHistory(requestId, entries);
}

async function fetchRequestByIdRaw(id: number): Promise<SupabaseSupportRequest | null> {
  const supabase = getSupabaseAdminClient();
  const selectColumns = [
    'id',
    'merchant_name',
    'outlet_name',
    'phone_number',
    'email',
    'fid',
    'oid',
    'issue_type',
    'issue_subcategory1',
    'issue_subcategory2',
    'issue_description',
    'ticket_description',
    'clickup_link',
    'clickup_task_id',
    'clickup_task_status',
    'clickup_task_status_synced_at',
    'attachment_url',
    'attachment_url_2',
    'attachment_url_3',
    'status',
    'closed_at',
    'updated_by',
    'ms_pic_user_id',
    'franchise_name_resolved',
    'outlet_name_resolved',
    'created_at',
    'updated_at',
  ].join(', ');

  const { data, error } = await supabase.from('support_requests').select(selectColumns).eq('id', id).single();
  if (error) {
    if ('code' in error && (error as { code?: string }).code === 'PGRST116') {
      return null;
    }
    throw error;
  }
  return data as unknown as SupabaseSupportRequest;
}

export type SupportRequestHistoryRow = {
  id: number;
  request_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
};

export async function getSupportRequestHistory(requestId: number): Promise<SupportRequestHistoryRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('support_request_history')
    .select('id, request_id, field_name, old_value, new_value, changed_at, changed_by')
    .eq('request_id', requestId)
    .order('changed_at', { ascending: false });

  if (error) {
    throw error;
  }
  return (data as unknown as SupportRequestHistoryRow[]) ?? [];
}

export async function createClickUpTaskForTicket(
  id: number,
  updatedBy: string | number | null,
): Promise<ClickUpTaskResult | null> {
  if (!isClickUpEnabled()) {
    throw new Error('ClickUp integration not configured');
  }
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from<ClickUpRequestRow>('support_requests')
    .select(
      'id, merchant_name, outlet_name, phone_number, email, fid, oid, issue_type, issue_description, clickup_link, clickup_task_id, clickup_task_status',
    )
    .eq('id', id)
    .single();
  if (error || !data) {
    throw error ?? new Error('Support request not found');
  }
  if (data.clickup_link) {
    return null;
  }
  const before: HistoryPayload = {
    clickup_link: data.clickup_link,
    clickup_task_id: data.clickup_task_id,
    clickup_task_status: data.clickup_task_status,
  };
  const task = await createClickUpTask({
    requestId: data.id,
    merchantName: data.merchant_name,
    outletName: data.outlet_name,
    phoneNumber: data.phone_number,
    email: data.email,
    fid: data.fid,
    oid: data.oid,
    issueType: data.issue_type,
    issueDescription: data.issue_description,
  });
  if (!task) {
    return null;
  }
  await supabase
    .from('support_requests')
    .update({
      clickup_link: task.url,
      clickup_task_id: task.id,
      clickup_task_status: task.status,
      clickup_task_status_synced_at: new Date(),
      updated_by: updatedBy,
      updated_at: new Date(),
    })
    .eq('id', id);
  const after: HistoryPayload = {
    clickup_link: task.url,
    clickup_task_id: task.id,
    clickup_task_status: task.status,
  };
  await recordHistoryDiff(id, before, after, updatedBy);
  return task;
}

export async function linkExistingClickUpTask(
  id: number,
  link: string,
  taskId: string | null,
  updatedBy: string | number | null,
) {
  const supabase = getSupabaseAdminClient();
  const existing = await fetchRequestByIdRaw(id);
  const before: HistoryPayload = {
    clickup_link: existing?.clickup_link ?? null,
    clickup_task_id: existing?.clickup_task_id ?? null,
    clickup_task_status: existing?.clickup_task_status ?? null,
  };
  const resolvedTaskId = taskId ?? extractClickUpTaskIdFromLink(link);
  let resolvedStatus: string | null = null;
  if (resolvedTaskId) {
    try {
      resolvedStatus = await fetchClickUpTaskStatus(resolvedTaskId);
    } catch (error) {
      console.warn('Failed to fetch ClickUp status while linking task', error);
    }
  }
  const { error } = await supabase
    .from('support_requests')
    .update({
      clickup_link: link,
      clickup_task_id: resolvedTaskId,
      clickup_task_status: resolvedStatus,
      clickup_task_status_synced_at: resolvedStatus ? new Date() : null,
      updated_by: updatedBy,
      updated_at: new Date(),
    })
    .eq('id', id);
  if (error) {
    throw error;
  }
  const after: HistoryPayload = {
    clickup_link: link,
    clickup_task_id: resolvedTaskId,
    clickup_task_status: resolvedStatus,
  };
  await recordHistoryDiff(id, before, after, updatedBy);
}

export async function unlinkClickUpTask(id: number, updatedBy: string | number | null) {
  const supabase = getSupabaseAdminClient();
  const existing = await fetchRequestByIdRaw(id);
  const before: HistoryPayload = {
    clickup_link: existing?.clickup_link ?? null,
    clickup_task_id: existing?.clickup_task_id ?? null,
    clickup_task_status: existing?.clickup_task_status ?? null,
  };
  const { error } = await supabase
    .from('support_requests')
    .update({
      clickup_link: null,
      clickup_task_id: null,
      clickup_task_status: null,
      clickup_task_status_synced_at: null,
      updated_by: updatedBy,
      updated_at: new Date(),
    })
    .eq('id', id);
  if (error) {
    throw error;
  }
  const after: HistoryPayload = {
    clickup_link: null,
    clickup_task_id: null,
    clickup_task_status: null,
  };
  await recordHistoryDiff(id, before, after, updatedBy);
}

export async function refreshClickUpTaskStatus(id: number, updatedBy: string | number | null): Promise<string | null> {
  if (!isClickUpEnabled()) {
    throw new Error('ClickUp integration not configured');
  }
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from<ClickUpStatusRow>('support_requests')
    .select('clickup_task_id, clickup_link, clickup_task_status')
    .eq('id', id)
    .single();
  if (error || !data) {
    throw error ?? new Error('Support request not found');
  }
  let taskId = data.clickup_task_id;
  if (!taskId && data.clickup_link) {
    taskId = extractClickUpTaskIdFromLink(data.clickup_link);
  }
  if (!taskId) {
    throw new Error('Ticket is not linked to a ClickUp task');
  }
  const before: HistoryPayload = {
    clickup_task_status: data.clickup_task_status ?? null,
  };
  const status = await fetchClickUpTaskStatus(taskId);
  const { error: updateError } = await supabase
    .from('support_requests')
    .update({
      clickup_task_status: status,
      clickup_task_status_synced_at: new Date(),
      clickup_task_id: taskId,
      updated_by: updatedBy,
      updated_at: new Date(),
    })
    .eq('id', id);
  if (updateError) {
    throw updateError;
  }
  const after: HistoryPayload = {
    clickup_task_status: status,
  };
  await recordHistoryDiff(id, before, after, updatedBy);
  return status ?? null;
}

function extractClickUpTaskIdFromLink(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^[a-z0-9_-]+$/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      return null;
    }
    const tIndex = segments.lastIndexOf('t');
    if (tIndex !== -1 && segments[tIndex + 1]) {
      return segments[tIndex + 1];
    }
    return segments[segments.length - 1] ?? null;
  } catch {
    const fallbackMatch = trimmed.match(/([a-z0-9]+)$/i);
    return fallbackMatch ? fallbackMatch[1] : null;
  }
}
