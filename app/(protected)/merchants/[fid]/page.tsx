import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import ticketStyles from '../../tickets/tickets.module.css';
import merchantStyles from '../merchants.module.css';
import styles from './franchise.module.css';
import OutletTable from '../OutletTable';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessMerchantsPages, canAccessTicketsPages } from '@/lib/branding';
import { fetchFranchiseOutlet, type FranchiseLookupResult } from '@/lib/franchise';
import { getCachedFranchiseByFid } from '@/lib/franchise-cache';
import { fetchRequestsByFid, storeFranchiseOutletResolution } from '@/lib/requests';
import { NO_OUTLET_FOUND } from '../../tickets/constants';
import { cleanId, formatDate } from '../../tickets/utils';

export const dynamic = 'force-dynamic';

const formatFranchiseName = (name: string | null, fid: string | null): string => {
  const cleaned = (name ?? '').trim();
  if (cleaned) {
    return cleaned;
  }
  return fid ? `Franchise ${fid}` : 'Unnamed franchise';
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

const buildFranchiseLink = (fid: string | null): string | null => {
  const cleaned = (fid ?? '').trim();
  if (!cleaned) {
    return null;
  }
  return `https://cloud.getslurp.com/batcave/franchise/${encodeURIComponent(cleaned)}`;
};

export default async function FranchisePage({ params }: { params: Promise<{ fid: string }> }) {
  const authUser = await getAuthenticatedUser();
  if (!canAccessMerchantsPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }
  const canSeeTickets = canAccessTicketsPages(authUser.department, authUser.isSuperAdmin);

  const resolvedParams = await params;
  const rawFid = decodeURIComponent(resolvedParams.fid ?? '').trim();
  if (!rawFid) {
    notFound();
  }

  const franchise = await getCachedFranchiseByFid(rawFid);
  if (!franchise) {
    notFound();
  }

  const franchiseName = formatFranchiseName(franchise.name, franchise.fid);
  const batcaveLink = buildFranchiseLink(franchise.fid ?? rawFid);
  let tickets: Awaited<ReturnType<typeof fetchRequestsByFid>>['rows'] = [];
  let totalTickets = 0;
  const franchiseLookupByRequestId = new Map<number, FranchiseLookupResult | null>();

  if (canSeeTickets) {
    const ticketsResult = await fetchRequestsByFid(rawFid, { limit: 200, withCount: true });
    tickets = ticketsResult.rows;
    totalTickets = typeof ticketsResult.count === 'number' ? ticketsResult.count : tickets.length;

    const franchiseLookupCache = new Map<string, FranchiseLookupResult | null>();
    const franchiseStoreTasks: Promise<void>[] = [];
    await Promise.all(
      tickets.map(async (ticket) => {
        const fid = cleanId(ticket.fid);
        const oid = cleanId(ticket.oid);
        if (!fid || !oid) {
          return;
        }
        const cacheKey = `${fid}-${oid}`;
        const existingFranchise = ticket.franchise_name_resolved?.trim() || null;
        const existingOutlet = ticket.outlet_name_resolved?.trim() || null;
        if (existingFranchise || existingOutlet) {
          const lookup: FranchiseLookupResult = {
            franchiseName: existingFranchise,
            outletName: existingOutlet,
            found: true,
          };
          franchiseLookupCache.set(cacheKey, lookup);
          franchiseLookupByRequestId.set(ticket.id, lookup);
          return;
        }
        if (franchiseLookupCache.has(cacheKey)) {
          const cached = franchiseLookupCache.get(cacheKey);
          franchiseLookupByRequestId.set(ticket.id, cached ?? null);
          return;
        }

        const lookup = await fetchFranchiseOutlet(fid, oid);
        franchiseLookupCache.set(cacheKey, lookup);
        franchiseLookupByRequestId.set(ticket.id, lookup ?? null);
        if (lookup && lookup.found && (lookup.franchiseName || lookup.outletName)) {
          franchiseStoreTasks.push(
            storeFranchiseOutletResolution(ticket.id, lookup.franchiseName ?? null, lookup.outletName ?? null).catch(
              (error) => {
                console.warn('Failed to store franchise lookup', ticket.id, error);
              },
            ),
          );
        }
      }),
    );
    if (franchiseStoreTasks.length > 0) {
      await Promise.all(franchiseStoreTasks);
    }
  }

  return (
    <div className={ticketStyles.page}>
      <section className={ticketStyles.hero}>
        <div className={ticketStyles.heroTop}>
          <div>
            <h1 className={ticketStyles.heroTitle}>{franchiseName}</h1>
            <p className={ticketStyles.heroSubtitle}>
              FID {franchise.fid ?? rawFid} · {franchise.outlets.length} outlets on record
            </p>
          </div>
          <div className={styles.heroActions}>
            {batcaveLink ? (
              <a className={styles.actionLink} href={batcaveLink} target="_blank" rel="noreferrer">
                View in Batcave
              </a>
            ) : null}
            <Link className={styles.actionLink} href="/merchants">
              Back to Merchants
            </Link>
          </div>
        </div>
      </section>

      <section className={ticketStyles.tableCard}>
        <div className={ticketStyles.tableHeader}>
          <h2>Franchise Details</h2>
          <span className={styles.sectionMeta}>Last synced from cache</span>
        </div>
        <div className={styles.sectionBody}>
          <div className={merchantStyles.detailGrid}>
            <div className={merchantStyles.detailItem}>
              <span className={merchantStyles.detailLabel}>Franchise</span>
              <span className={merchantStyles.detailValue}>{franchiseName}</span>
            </div>
            <div className={merchantStyles.detailItem}>
              <span className={merchantStyles.detailLabel}>Company</span>
              <span className={merchantStyles.detailValue}>{formatDetailValue(franchise.company ?? null)}</span>
            </div>
            <div className={merchantStyles.detailItem}>
              <span className={merchantStyles.detailLabel}>Company Address</span>
              <span className={merchantStyles.detailValue}>{formatDetailValue(franchise.companyAddress ?? null)}</span>
            </div>
            <div className={merchantStyles.detailItem}>
              <span className={merchantStyles.detailLabel}>Created At</span>
              <span className={merchantStyles.detailValue}>{formatDateTime(franchise.createdAt ?? null)}</span>
            </div>
            <div className={merchantStyles.detailItem}>
              <span className={merchantStyles.detailLabel}>Updated At</span>
              <span className={merchantStyles.detailValue}>{formatDateTime(franchise.updatedAt ?? null)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className={ticketStyles.tableCard}>
        <div className={ticketStyles.tableHeader}>
          <h2>Outlets</h2>
          <span className={styles.sectionMeta}>{franchise.outlets.length} total</span>
        </div>
        <div className={franchise.outlets.length === 0 ? styles.sectionBody : styles.tableSectionBody}>
          {franchise.outlets.length === 0 ? (
            <p className={styles.emptyState}>No outlets found for this franchise.</p>
          ) : (
            <OutletTable outlets={franchise.outlets} />
          )}
        </div>
      </section>

      {canSeeTickets ? (
        <section className={ticketStyles.tableCard}>
          <div className={ticketStyles.tableHeader}>
            <h2>Support Requests</h2>
            <span className={styles.sectionMeta}>{totalTickets} total</span>
          </div>
          <div className={ticketStyles.tableWrapper}>
            <table className={`${ticketStyles.table} ${styles.ticketsTable}`}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Merchant / Outlet</th>
                  <th>Issue Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={ticketStyles.empty}>
                      No support requests found for this franchise.
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => {
                    const franchiseLookup = franchiseLookupByRequestId.get(ticket.id) ?? null;
                    const dbOutletResolved = ticket.outlet_name_resolved?.trim() || null;
                    const outletDisplay =
                      dbOutletResolved ??
                      (franchiseLookup && franchiseLookup.found ? franchiseLookup.outletName ?? null : null) ??
                      ticket.outlet_name ??
                      null;
                    const finalOutlet = outletDisplay ?? NO_OUTLET_FOUND;

                    return (
                      <tr key={ticket.id}>
                        <td className={styles.ticketId}>#{ticket.id}</td>
                        <td>
                          <span>{ticket.merchant_name}</span>
                          <span className={styles.ticketSecondary}>{finalOutlet}</span>
                        </td>
                        <td>{ticket.issue_type}</td>
                        <td>{ticket.status}</td>
                        <td>{formatDate(ticket.created_at)}</td>
                        <td>
                        <Link className={ticketStyles.viewButton} href={`/merchants/tickets/${ticket.id}`}>
                          View
                        </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {tickets.length < totalTickets ? (
            <p className={styles.ticketsMeta}>
              Showing {tickets.length} of {totalTickets} requests. Refine in the tickets view for more.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
