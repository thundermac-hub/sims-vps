import { env } from './env';

export interface ClickUpTaskInput {
  requestId: number;
  merchantName: string;
  outletName: string;
  phoneNumber: string;
  email: string | null;
  fid: string;
  oid: string;
  issueType: string;
  issueDescription: string;
}

export interface ClickUpTaskResult {
  id: string;
  url: string;
  status: string | null;
}

export function isClickUpEnabled(): boolean {
  return Boolean(env.clickupToken && env.clickupListId);
}

export async function createClickUpTask(payload: ClickUpTaskInput): Promise<ClickUpTaskResult | null> {
  if (!isClickUpEnabled()) {
    return null;
  }

  const url = `https://api.clickup.com/api/v2/list/${env.clickupListId}/task`;
  const description = buildTaskDescription(payload);
  const body = {
    name: `Support Request #${payload.requestId} – ${payload.merchantName}`,
    description,
    tags: buildTags(payload.issueType),
    notify_all: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: env.clickupToken as string,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await safeReadJson(response);
    throw new Error(
      `ClickUp task creation failed (${response.status}): ${JSON.stringify(errorBody ?? response.statusText)}`,
    );
  }

  const result = (await response.json()) as {
    id: string;
    url?: string;
    status?: { status?: string } | string;
  };

  const status = extractClickUpStatus(result.status);

  if (!result.id) {
    throw new Error('ClickUp response missing task id');
  }

  return {
    id: result.id,
    url: result.url ?? buildClickUpTaskUrl(result.id),
    status,
  };
}

function buildTaskDescription(input: ClickUpTaskInput): string {
  const lines = [
    `Merchant: ${input.merchantName}`,
    `Outlet: ${input.outletName}`,
    `Phone: ${input.phoneNumber}`,
    input.email ? `Email: ${input.email}` : 'Email: -',
    `FID: ${input.fid}`,
    `OID: ${input.oid}`,
    `Issue Type: ${input.issueType}`,
    '',
    'Issue Description:',
    input.issueDescription,
    '',
    `Support Request ID: #${input.requestId}`,
  ];
  return lines.join('\n');
}

function buildTags(issueType: string): string[] {
  const tags = ['SIMS'];
  if (issueType) {
    // Slugify the issue type to avoid spaces in tag names.
    tags.push(issueType.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  }
  return tags;
}

export function buildClickUpTaskUrl(taskId: string): string {
  if (!env.clickupTeamId) {
    return `https://app.clickup.com/t/${taskId}`;
  }
  return `https://app.clickup.com/${env.clickupTeamId}/v/t/${taskId}`;
}

export async function fetchClickUpTaskStatus(taskId: string): Promise<string | null> {
  if (!env.clickupToken) {
    throw new Error('ClickUp integration not configured');
  }
  const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: env.clickupToken,
    },
  });
  if (!response.ok) {
    const errorBody = await safeReadJson(response);
    throw new Error(
      `ClickUp status fetch failed (${response.status}): ${JSON.stringify(errorBody ?? response.statusText)}`,
    );
  }
  const result = (await response.json()) as { status?: { status?: string } | string };
  return extractClickUpStatus(result.status);
}

function extractClickUpStatus(rawStatus: unknown): string | null {
  if (typeof rawStatus === 'string') {
    return rawStatus;
  }
  if (rawStatus && typeof rawStatus === 'object' && 'status' in rawStatus) {
    const value = (rawStatus as { status?: string }).status;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

async function safeReadJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
