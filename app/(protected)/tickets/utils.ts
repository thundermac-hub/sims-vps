import { env } from '@/lib/env';
import { buildClickUpTaskUrl } from '@/lib/clickup';
import { MERCHANT_SUCCESS_DEPARTMENT } from './constants';

export const cleanId = (value: string | null | undefined) => (value ?? '').trim().replace(/\D/g, '');

export function formatUserDisplayName(identifier: string | null): string | null {
  if (!identifier) {
    return null;
  }
  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.includes('@')) {
    return trimmed;
  }
  const [localPart] = trimmed.split('@');
  const words = localPart.replace(/[\.\-_]+/g, ' ').split(' ').filter(Boolean);
  if (words.length === 0) {
    return trimmed;
  }
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function resolveUserDisplay(identifier: string | number | null, userDisplayById: Map<string, string>): string | null {
  if (identifier === null || identifier === undefined) {
    return null;
  }
  const idString = String(identifier).trim();
  if (!idString) {
    return null;
  }
  const mapped = userDisplayById.get(idString);
  if (mapped) {
    return mapped;
  }
  if (idString.includes('@')) {
    return formatUserDisplayName(idString);
  }
  return null;
}

export function isMerchantSuccessUser(department: string | null, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  return (department ?? '').trim().toLowerCase() === MERCHANT_SUCCESS_DEPARTMENT;
}

export type NormalisedClickUpLink = {
  link: string;
  taskId: string | null;
};

export function normaliseClickUpLinkInput(value: string): NormalisedClickUpLink | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const hasProtocol = /^[a-z]+:\/\//i.test(trimmed);
  const looksLikeClickUpDomain = trimmed.includes('clickup.com');
  if (hasProtocol || looksLikeClickUpDomain) {
    const link = hasProtocol ? trimmed : `https://${trimmed}`;
    return { link, taskId: extractClickUpTaskId(link) };
  }
  if (/^[a-z0-9_-]+$/i.test(trimmed)) {
    return { link: buildClickUpTaskUrl(trimmed), taskId: trimmed };
  }
  return null;
}

export function extractClickUpTaskId(candidate: string): string | null {
  if (/^[a-z0-9_-]+$/i.test(candidate.trim())) {
    return candidate.trim();
  }
  try {
    const url = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
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
    const fallbackMatch = candidate.match(/([a-z0-9]+)$/i);
    return fallbackMatch ? fallbackMatch[1] : null;
  }
}

export function formatDate(value: Date, timezone = env.timezone) {
  const formatter = new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  });
  return formatter.format(value);
}
