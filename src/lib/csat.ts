import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from './db';
import { CSAT_SCORES, type CsatScore } from './csat-types';
export { CSAT_SCORES, type CsatScore } from './csat-types';

export type CsatLinkInfo = {
  requestId: number;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  submittedAt: Date | null;
  isExpired: boolean;
};

export type CsatInviteDetails = CsatLinkInfo & {
  merchantName: string | null;
  outletName: string | null;
};

export type CsatAnalytics = {
  totalResponses: number;
  resolvedCount: number | null;
  sentCount: number | null;
  responseRate: number | null;
  supportBreakdown: Record<CsatScore, number>;
  productBreakdown: Record<CsatScore, number>;
  averageSupportScore: number | null;
  averageProductScore: number | null;
  recentFeedback: Array<{
    id: number;
    requestId: number;
    submittedAt: Date;
    supportReason: string | null;
    productFeedback: string | null;
    merchantName: string | null;
    outletName: string | null;
  }>;
};

export class CsatSubmissionError extends Error {
  code: 'invalid_token' | 'expired' | 'already_submitted' | 'server_error';

  constructor(code: CsatSubmissionError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'CsatSubmissionError';
  }
}

type CsatTokenRow = {
  id: number;
  request_id: number;
  token: string;
  expires_at: string;
  used_at?: string | null;
  created_at?: string | null;
};

type CsatResponseRow = {
  id: number;
  request_id: number;
  token_id: number | null;
  support_score: string;
  support_reason: string | null;
  product_score: string;
  product_feedback: string | null;
  submitted_at: string;
};

const SCORE_WEIGHT: Record<CsatScore, number> = {
  'Very Satisfied': 4,
  Satisfied: 3,
  Neutral: 2,
  Dissatisfied: 1,
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function buildBreakdown(): Record<CsatScore, number> {
  return {
    'Very Satisfied': 0,
    Satisfied: 0,
    Neutral: 0,
    Dissatisfied: 0,
  };
}

function mapTokenRow(row: CsatTokenRow, submittedAt: Date | null): CsatLinkInfo {
  const expiresAt = toDate(row.expires_at) ?? new Date(Date.now() + THREE_DAYS_MS);
  const usedAt = toDate(row.used_at ?? null);
  const now = Date.now();
  return {
    requestId: Number(row.request_id),
    token: row.token,
    expiresAt,
    usedAt,
    submittedAt,
    isExpired: expiresAt.getTime() <= now,
  };
}

function resolveExpiryAnchor(closedAt: string | Date | null): Date {
  const now = new Date();
  if (!closedAt) {
    return now;
  }
  const closed = closedAt instanceof Date ? closedAt : new Date(closedAt);
  if (Number.isNaN(closed.getTime())) {
    return now;
  }
  return closed.getTime() < now.getTime() ? now : closed;
}

export async function ensureCsatTokenForRequest(
  requestId: number,
  closedAt: string | Date | null,
  options: { forceNew?: boolean } = {},
): Promise<CsatLinkInfo> {
  const supabase = getSupabaseAdminClient();
  const { forceNew = false } = options;
  let existing: CsatTokenRow | null = null;

  if (!forceNew) {
    const { data, error } = await supabase
      .from('csat_tokens')
      .select('id, request_id, token, expires_at, used_at, created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw error;
    }
    existing = (data as CsatTokenRow | null) ?? null;
    if (existing) {
      const mapped = mapTokenRow(existing, null);
      if (!mapped.isExpired) {
        return mapped;
      }
    }
  }

  const anchor = resolveExpiryAnchor(closedAt);
  const expiresAt = new Date(anchor.getTime() + THREE_DAYS_MS);
  const { data: inserted, error: insertError } = await supabase
    .from('csat_tokens')
    .insert({
      request_id: requestId,
      token: randomUUID(),
      expires_at: expiresAt,
    })
    .select('id, request_id, token, expires_at, used_at, created_at')
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error('Failed to create CSAT link');
  }

  return mapTokenRow(inserted as CsatTokenRow, null);
}

export async function fetchLatestCsatLinks(requestIds: number[]): Promise<Map<number, CsatLinkInfo>> {
  const map = new Map<number, CsatLinkInfo>();
  const ids = Array.from(new Set(requestIds.filter((value) => Number.isFinite(value)))) as number[];
  if (ids.length === 0) {
    return map;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('csat_tokens')
    .select('id, request_id, token, expires_at, used_at, created_at')
    .in('request_id', ids)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.warn('Failed to load CSAT tokens', error);
    return map;
  }

  const latestPerRequest = new Map<number, CsatTokenRow>();
  (data as CsatTokenRow[]).forEach((row) => {
    if (!latestPerRequest.has(row.request_id)) {
      latestPerRequest.set(row.request_id, row);
    }
  });

  const tokenIds = Array.from(latestPerRequest.values())
    .map((row) => row.id)
    .filter((value) => Number.isFinite(value));
  const responseByTokenId = new Map<number, Date>();

  if (tokenIds.length > 0) {
    const { data: responses, error: responseError } = await supabase
      .from('csat_responses')
      .select('token_id, submitted_at')
      .in('token_id', tokenIds);
    if (responseError) {
      console.warn('Failed to load CSAT responses', responseError);
    } else if (responses) {
      (responses as { token_id: number | null; submitted_at: string }[]).forEach((response) => {
        if (response.token_id) {
          const submitted = toDate(response.submitted_at);
          if (submitted) {
            responseByTokenId.set(response.token_id, submitted);
          }
        }
      });
    }
  }

  latestPerRequest.forEach((row, requestId) => {
    const submittedAt = responseByTokenId.get(row.id) ?? null;
    map.set(requestId, mapTokenRow(row, submittedAt));
  });

  return map;
}

export async function getCsatInviteByToken(token: string): Promise<CsatInviteDetails | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const supabase = getSupabaseAdminClient();
  try {
    const rows = await supabase.query<
      CsatTokenRow & { merchant_name?: string | null; outlet_name?: string | null }
    >(
      `
        SELECT
          t.id,
          t.request_id,
          t.token,
          t.expires_at,
          t.used_at,
          t.created_at,
          r.merchant_name,
          r.outlet_name
        FROM csat_tokens t
        LEFT JOIN support_requests r ON r.id = t.request_id
        WHERE t.token = ?
        LIMIT 1
      `,
      [trimmed],
    );
    const tokenRow = rows[0];
    if (!tokenRow) {
      return null;
    }

    const responseRows = await supabase.query<{ submitted_at?: string }>(
      'SELECT submitted_at FROM csat_responses WHERE token_id = ? LIMIT 1',
      [tokenRow.id],
    );
    const submittedAt = toDate(responseRows[0]?.submitted_at ?? null);

    return {
      ...mapTokenRow(tokenRow, submittedAt),
      merchantName: tokenRow.merchant_name ?? null,
      outletName: tokenRow.outlet_name ?? null,
    };
  } catch (error) {
    console.warn('Failed to fetch CSAT invite by token', error);
    return null;
  }
}

export async function submitCsatResponse(input: {
  token: string;
  supportScore: CsatScore;
  supportReason: string | null;
  productScore: CsatScore;
  productFeedback: string | null;
}): Promise<{ requestId: number; submittedAt: Date }> {
  const supabase = getSupabaseAdminClient();
  const tokenValue = input.token.trim();
  if (!tokenValue) {
    throw new CsatSubmissionError('invalid_token', 'Missing CSAT token.');
  }

  const { data: tokenRow, error: tokenError } = await supabase
    .from('csat_tokens')
    .select('id, request_id, token, expires_at, used_at, created_at')
    .eq('token', tokenValue)
    .maybeSingle();
  if (tokenError) {
    throw new CsatSubmissionError('server_error', 'Unable to validate CSAT token.');
  }
  if (!tokenRow) {
    throw new CsatSubmissionError('invalid_token', 'Invalid CSAT token.');
  }

  const mappedToken = mapTokenRow(tokenRow as CsatTokenRow, null);
  if (mappedToken.isExpired) {
    throw new CsatSubmissionError('expired', 'This survey link has expired.');
  }

  const { data: existingResponse, error: existingError } = await supabase
    .from('csat_responses')
    .select('id')
    .eq('token_id', (tokenRow as CsatTokenRow).id)
    .maybeSingle();
  if (existingError) {
    throw new CsatSubmissionError('server_error', 'Unable to check previous submission.');
  }
  if (existingResponse) {
    throw new CsatSubmissionError('already_submitted', 'You have already submitted feedback.');
  }

  const submittedAt = new Date();
  const { error: insertError } = await supabase.from('csat_responses').insert({
    request_id: (tokenRow as CsatTokenRow).request_id,
    token_id: (tokenRow as CsatTokenRow).id,
    support_score: input.supportScore,
    support_reason: input.supportReason,
    product_score: input.productScore,
    product_feedback: input.productFeedback,
    submitted_at: submittedAt,
  });
  if (insertError) {
    if ('code' in insertError && (insertError as { code?: string }).code === '23505') {
      throw new CsatSubmissionError('already_submitted', 'You have already submitted feedback.');
    }
    throw new CsatSubmissionError(
      'server_error',
      insertError instanceof Error && insertError.message ? insertError.message : 'Unable to store CSAT response.',
    );
  }

  try {
    await supabase
      .from('csat_tokens')
      .update({ used_at: submittedAt })
      .eq('id', (tokenRow as CsatTokenRow).id);
  } catch (err) {
    console.warn('Failed to mark CSAT token as used', err);
  }

  return {
    requestId: (tokenRow as CsatTokenRow).request_id,
    submittedAt,
  };
}

export async function getCsatAnalytics(): Promise<CsatAnalytics> {
  const supabase = getSupabaseAdminClient();
  const emptyBreakdown = buildBreakdown();
const empty: CsatAnalytics = {
  totalResponses: 0,
  resolvedCount: null,
  sentCount: null,
  responseRate: null,
  supportBreakdown: { ...emptyBreakdown },
  productBreakdown: { ...emptyBreakdown },
  averageSupportScore: null,
  averageProductScore: null,
    recentFeedback: [],
  };

  const { data, error } = await supabase
    .from('csat_responses')
    .select('id, request_id, token_id, support_score, support_reason, product_score, product_feedback, submitted_at')
    .order('submitted_at', { ascending: false });

  if (error || !data) {
    console.warn('Failed to load CSAT responses', error);
    return empty;
  }

  const responses = data as CsatResponseRow[];
  const filteredResponses = await (async () => {
    const ids = Array.from(new Set(responses.map((row) => row.request_id))).filter((id) => Number.isFinite(id)) as number[];
    if (ids.length === 0) return responses;
    try {
      const { data: requests, error: reqError } = await supabase
        .from('support_requests')
        .select('id, hidden')
        .in('id', ids)
        .eq('hidden', false);
      if (reqError || !requests) {
        if (reqError && (reqError as { code?: string }).code !== '42703') {
          console.warn('Failed to filter CSAT responses by archived state', reqError);
        }
        return responses;
      }
      const allowed = new Set((requests as { id: number }[]).map((row) => row.id));
      return responses.filter((row) => allowed.has(row.request_id));
    } catch (err) {
      console.warn('Failed to filter CSAT responses by archived state', err);
      return responses;
    }
  })();
  const supportBreakdown = buildBreakdown();
  const productBreakdown = buildBreakdown();

  filteredResponses.forEach((row) => {
    const supportScore = row.support_score as CsatScore;
    const productScore = row.product_score as CsatScore;
    if (supportBreakdown[supportScore] !== undefined) {
      supportBreakdown[supportScore] += 1;
    }
    if (productBreakdown[productScore] !== undefined) {
      productBreakdown[productScore] += 1;
    }
  });

  const totalResponses = filteredResponses.length;
  const averageSupportScore = computeAverageScore(supportBreakdown);
  const averageProductScore = computeAverageScore(productBreakdown);

  const feedbackEntries = filteredResponses
    .filter((row) => {
      const hasSupport = Boolean(row.support_reason && row.support_reason.trim().length > 0);
      const hasProduct = Boolean(row.product_feedback && row.product_feedback.trim().length > 0);
      return hasSupport || hasProduct;
    })
    .slice(0, 12);

  const requestIds = Array.from(new Set(feedbackEntries.map((row) => row.request_id))).filter((id) =>
    Number.isFinite(id),
  ) as number[];

  const requestMeta = new Map<number, { merchantName: string | null; outletName: string | null }>();
  if (requestIds.length > 0) {
    const { data: requests, error: requestError } = await supabase
      .from('support_requests')
      .select('id, merchant_name, outlet_name, outlet_name_resolved, franchise_name_resolved')
      .in('id', requestIds);
    if (requestError) {
      console.warn('Failed to load request metadata for CSAT dashboard', requestError);
    } else if (requests) {
      (
        requests as {
          id: number;
          merchant_name: string | null;
          outlet_name: string | null;
          outlet_name_resolved: string | null;
          franchise_name_resolved: string | null;
        }[]
      ).forEach((req) => {
        const merchant = (req.merchant_name ?? '').trim();
        const outletResolved = (req.outlet_name_resolved ?? '').trim();
        const outletRaw = (req.outlet_name ?? '').trim();
        requestMeta.set(req.id, {
          merchantName: merchant || null,
          outletName: outletResolved || outletRaw || req.franchise_name_resolved || null,
        });
      });
    }
  }

  const recentFeedback = feedbackEntries.map((row) => {
    const meta = requestMeta.get(row.request_id) ?? { merchantName: null, outletName: null };
    return {
      id: row.id,
      requestId: row.request_id,
      submittedAt: toDate(row.submitted_at) ?? new Date(),
      supportReason: row.support_reason,
      productFeedback: row.product_feedback,
      merchantName: meta.merchantName,
      outletName: meta.outletName,
    };
  });

  let resolvedCount: number | null = null;
  try {
    const { count } = await supabase
      .from('support_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Resolved')
      .eq('hidden', false);
    resolvedCount = typeof count === 'number' ? count : null;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '42703') {
      const { count } = await supabase
        .from('support_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Resolved');
      resolvedCount = typeof count === 'number' ? count : null;
    } else {
      console.warn('Failed to load resolved ticket count for CSAT dashboard', err);
    }
  }

  let sentCount: number | null = null;
  try {
    const { data, error } = await supabase
      .from('support_request_history')
      .select('request_id')
      .eq('field_name', 'csat_whatsapp_sent')
      .eq('new_value', 'true');
    if (error) {
      throw error;
    }
    const uniqueIds = Array.from(
      new Set(
        ((data as { request_id: number }[] | null) ?? [])
          .map((row) => Number(row.request_id))
          .filter((id) => Number.isFinite(id)),
      ),
    ) as number[];
    if (uniqueIds.length === 0) {
      sentCount = 0;
    } else {
      try {
        const { data: sentRequests, error: sentError } = await supabase
          .from('support_requests')
          .select('id, hidden')
          .in('id', uniqueIds)
          .eq('hidden', false);
        if (sentError) {
          throw sentError;
        }
        sentCount = ((sentRequests as { id: number }[] | null) ?? []).length;
      } catch (sentErr) {
        const code = (sentErr as { code?: string })?.code;
        if (code === '42703') {
          sentCount = uniqueIds.length;
        } else {
          throw sentErr;
        }
      }
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== '42P01') {
      console.warn('Failed to load CSAT send count for dashboard', err);
    }
  }

  const responseRate = sentCount && sentCount > 0 ? Math.min(1, totalResponses / sentCount) : null;

  return {
    totalResponses,
    resolvedCount,
    sentCount,
    responseRate,
    supportBreakdown,
    productBreakdown,
    averageSupportScore,
    averageProductScore,
    recentFeedback,
  };
}

function computeAverageScore(breakdown: Record<CsatScore, number>): number | null {
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return null;
  }
  const weighted = (Object.entries(breakdown) as [CsatScore, number][]).reduce((sum, [score, count]) => {
    return sum + SCORE_WEIGHT[score] * count;
  }, 0);
  return Math.round((weighted / total) * 100) / 100;
}
