'use client';

import { Fragment, useState } from 'react';
import { ExternalLink, Minus, Plus } from 'lucide-react';
import ticketStyles from '../tickets/tickets.module.css';
import styles from './merchants.module.css';
import type { FranchiseOutletSummary } from '@/lib/franchise';

interface OutletTableProps {
  outlets: FranchiseOutletSummary[];
}

const formatOutletName = (name: string | null): string => {
  const cleaned = (name ?? '').trim();
  return cleaned || 'Unnamed outlet';
};

const formatOutletId = (id: string | null): string => {
  const cleaned = (id ?? '').trim();
  return cleaned || '-';
};

const normalizeDateInput = (value: string): string =>
  value.replace(/([+-]\d{2})(\d{2})$/, (_match, hours, minutes) => `${hours}:${minutes}`);

const parseDateTime = (value: string | null): Date | null => {
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

const formatDateTime = (value: string | null): string => {
  const date = parseDateTime(value);
  if (!date) {
    const cleaned = (value ?? '').trim();
    return cleaned || '-';
  }
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

const formatDetailValue = (value: string | null): string => {
  const cleaned = (value ?? '').trim();
  return cleaned || '-';
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type OutletStatusTone = 'active' | 'expiring' | 'expired';

const getOutletStatus = (validUntil: string | null): { label: string; tone: OutletStatusTone } => {
  const date = parseDateTime(validUntil);
  if (!date) {
    return { label: 'Active', tone: 'active' };
  }
  const now = Date.now();
  const diff = date.getTime() - now;
  if (diff < 0) {
    return { label: 'Expired', tone: 'expired' };
  }
  if (diff <= THIRTY_DAYS_MS) {
    return { label: 'Expiring Soon', tone: 'expiring' };
  }
  return { label: 'Active', tone: 'active' };
};

export default function OutletTable({ outlets }: OutletTableProps) {
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const toggleOpen = (key: string) => {
    setOpenKeys((previous) => (previous.includes(key) ? previous.filter((value) => value !== key) : [...previous, key]));
  };

  return (
    <div className={ticketStyles.tableWrapper}>
      <table className={`${ticketStyles.table} ${styles.merchantsTable}`}>
        <thead>
          <tr>
            <th>OID</th>
            <th>Outlet</th>
            <th>Status</th>
            <th>Valid Until</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {outlets.map((outlet, index) => {
            const outletName = formatOutletName(outlet.name ?? null);
            const outletId = formatOutletId(outlet.id ?? null);
            const outletStatus = getOutletStatus(outlet.validUntil ?? null);
            const key = `${outlet.id ?? 'outlet'}-${outlet.name ?? 'name'}-${index}`;
            const isOpen = openKeys.includes(key);
            const rowId = `outlet-${index}`;
            return (
              <Fragment key={key}>
                <tr className={`${styles.tableRow} ${isOpen ? styles.tableRowExpanded : ''}`} onClick={() => toggleOpen(key)}>
                  <td className={styles.fidCell}>{outletId}</td>
                  <td className={styles.franchiseMainCell}>
                    <span className={styles.franchiseTitle}>{outletName}</span>
                  </td>
                  <td>
                    <span
                      className={`${styles.outletStatus} ${
                        outletStatus.tone === 'expired'
                          ? styles.outletStatusExpired
                          : outletStatus.tone === 'expiring'
                            ? styles.outletStatusExpiring
                            : styles.outletStatusActive
                      }`}
                    >
                      {outletStatus.label}
                    </span>
                  </td>
                  <td>{formatDateTime(outlet.validUntil ?? null)}</td>
                  <td className={styles.expandCell}>
                    <button
                      type="button"
                      className={styles.expandButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleOpen(key);
                      }}
                      aria-label={isOpen ? 'Collapse outlet details' : 'Expand outlet details'}
                      aria-expanded={isOpen}
                      aria-controls={rowId}
                    >
                      {isOpen ? (
                        <Minus className={styles.expandIcon} size={16} aria-hidden="true" />
                      ) : (
                        <Plus className={styles.expandIcon} size={16} aria-hidden="true" />
                      )}
                    </button>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className={`${styles.detailRow} ${styles.detailRowExpanded}`} id={rowId}>
                    <td colSpan={5} className={styles.detailCell}>
                      <div className={styles.detailGrid}>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Address</span>
                          <span className={styles.detailValue}>{formatDetailValue(outlet.address ?? null)}</span>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Created At</span>
                          <span className={styles.detailValue}>{formatDateTime(outlet.createdAt ?? null)}</span>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Updated At</span>
                          <span className={styles.detailValue}>{formatDateTime(outlet.updatedAt ?? null)}</span>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Valid Until</span>
                          <span className={styles.detailValue}>{formatDateTime(outlet.validUntil ?? null)}</span>
                        </div>
                      </div>
                      {outlet.mapsUrl ? (
                        <div className={styles.outletDetailActions}>
                          <a className={styles.mapLink} href={outlet.mapsUrl} target="_blank" rel="noreferrer">
                            View on Maps
                            <span className={styles.mapLinkIcon} aria-hidden="true">
                              <ExternalLink />
                            </span>
                          </a>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
