import { redirect } from 'next/navigation';
import styles from './dashboard.module.css';
import DashboardAutoRefresh from './DashboardAutoRefresh';
import { env } from '@/lib/env';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages } from '@/lib/branding';
import { getDashboardMetrics, type DashboardMetrics } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

const EMPTY_METRICS: DashboardMetrics = {
  openCount: 0,
  inProgressCount: 0,
  pendingCustomerCount: 0,
  newTicketsToday: 0,
  newTicketsYesterday: 0,
  resolvedToday: 0,
  resolvedYesterday: 0,
  msPicWorkload: [],
  msPicPendingCustomer: [],
  msPicResolvedToday: [],
  openByIssueType: [],
};

export default async function AnalyticsDashboard() {
  const authUser = await getAuthenticatedUser();
  if (!canAccessSupportPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }

  let metrics: DashboardMetrics | null = null;
  try {
    metrics = await getDashboardMetrics();
  } catch (error) {
    console.error('Failed to load dashboard metrics', error);
  }

  const dataUnavailable = metrics === null;
  const metricsToRender = metrics ?? EMPTY_METRICS;
  const todayLabel = new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'full',
    timeZone: env.timezone,
  }).format(new Date());
  const numberFormatter = new Intl.NumberFormat('en-MY');
  const inFlightTickets = metricsToRender.openCount + metricsToRender.inProgressCount;
  const activeTickets = inFlightTickets + metricsToRender.pendingCustomerCount;
  const newTicketsDelta = metricsToRender.newTicketsToday - metricsToRender.newTicketsYesterday;
  const resolvedTicketsDelta = metricsToRender.resolvedToday - metricsToRender.resolvedYesterday;
  const workloadMax = getMaxCount(metricsToRender.msPicWorkload);
  const pendingCustomerMax = getMaxCount(metricsToRender.msPicPendingCustomer);
  const resolvedWorkloadMax = getMaxCount(metricsToRender.msPicResolvedToday);
  const issueTypeMax = getMaxCount(metricsToRender.openByIssueType);

  return (
    <div className={styles.page}>
      <DashboardAutoRefresh interval={15000} />
      <section className={styles.heroCard}>
        <h1 className={styles.heroTitle}>Support Analytics Overview</h1>
        <p className={styles.heroSubtitle}>
          Daily snapshot for <strong>{todayLabel}</strong>. All metrics are aligned to {env.timezone}.
        </p>
        {dataUnavailable ? (
          <p className={styles.errorNotice}>
            Unable to refresh metrics right now. Check your connection; auto-refresh will retry shortly.
          </p>
        ) : null}
      </section>

      <section className={styles.grid}>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Active tickets</p>
          <p className={styles.statValue}>{numberFormatter.format(activeTickets)}</p>
          <p className={styles.statDelta}>
            Open: {numberFormatter.format(metricsToRender.openCount)} · In progress:{' '}
            {numberFormatter.format(metricsToRender.inProgressCount)} · Pending customer:{' '}
            {numberFormatter.format(metricsToRender.pendingCustomerCount)}
          </p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>New tickets today</p>
          <p className={styles.statValue}>{numberFormatter.format(metricsToRender.newTicketsToday)}</p>
          <p className={styles.statDelta}>
            {metricsToRender.newTicketsYesterday === 0
              ? 'No tickets logged yesterday'
              : `${newTicketsDelta >= 0 ? '+' : ''}${numberFormatter.format(newTicketsDelta)} vs ${numberFormatter.format(metricsToRender.newTicketsYesterday)} yesterday`}
          </p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Resolved today</p>
          <p className={styles.statValue}>{numberFormatter.format(metricsToRender.resolvedToday)}</p>
          <p className={styles.statDelta}>
            {metricsToRender.resolvedYesterday === 0
              ? 'No tickets resolved yesterday'
              : `${resolvedTicketsDelta >= 0 ? '+' : ''}${numberFormatter.format(resolvedTicketsDelta)} vs ${numberFormatter.format(metricsToRender.resolvedYesterday)} yesterday`}
          </p>
        </article>
      </section>

      <section className={styles.metricsRow}>
        <article className={styles.listCard}>
          <header className={styles.listHeader}>
            <div>
              <p className={styles.listTitle}>Current workload</p>
              <p className={styles.listSubtitle}>Open &amp; In-progress per MS PIC</p>
            </div>
            <span className={styles.pill}>{numberFormatter.format(inFlightTickets)}</span>
          </header>
          {metricsToRender.msPicWorkload.length === 0 ? (
            <p className={styles.emptyState}>No active assignments.</p>
          ) : (
            <ul className={styles.listItems}>
              {metricsToRender.msPicWorkload.map((item) => (
                <li key={item.userId ?? 'unassigned'} className={styles.listItem}>
                  <div className={styles.listItemHeader}>
                    <span className={styles.listLabel}>{item.label}</span>
                    <span className={styles.listValue}>{numberFormatter.format(item.count)}</span>
                  </div>
                  <div className={styles.chartBar}>
                    <span className={styles.chartBarFill} style={{ width: `${getBarWidth(item.count, workloadMax)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className={styles.listCard}>
          <header className={styles.listHeader}>
            <div>
              <p className={styles.listTitle}>Pending customer</p>
              <p className={styles.listSubtitle}>Awaiting customer response per MS PIC</p>
            </div>
            <span className={styles.pill}>{numberFormatter.format(metricsToRender.pendingCustomerCount)}</span>
          </header>
          {metricsToRender.msPicPendingCustomer.length === 0 ? (
            <p className={styles.emptyState}>No tickets waiting on customers.</p>
          ) : (
            <ul className={styles.listItems}>
              {metricsToRender.msPicPendingCustomer.map((item) => (
                <li key={item.userId ?? `pending-${item.label}`} className={styles.listItem}>
                  <div className={styles.listItemHeader}>
                    <span className={styles.listLabel}>{item.label}</span>
                    <span className={styles.listValue}>{numberFormatter.format(item.count)}</span>
                  </div>
                  <div className={styles.chartBar}>
                    <span
                      className={styles.chartBarFill}
                      style={{ width: `${getBarWidth(item.count, pendingCustomerMax)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className={styles.listCard}>
          <header className={styles.listHeader}>
            <div>
              <p className={styles.listTitle}>Resolved today</p>
              <p className={styles.listSubtitle}>Tickets closed per MS PIC</p>
            </div>
            <span className={styles.pill}>{numberFormatter.format(metricsToRender.resolvedToday)}</span>
          </header>
          {metricsToRender.msPicResolvedToday.length === 0 ? (
            <p className={styles.emptyState}>No tickets resolved today.</p>
          ) : (
            <ul className={styles.listItems}>
              {metricsToRender.msPicResolvedToday.map((item) => (
                <li key={item.userId ?? `resolved-${item.label}`} className={styles.listItem}>
                  <div className={styles.listItemHeader}>
                    <span className={styles.listLabel}>{item.label}</span>
                    <span className={styles.listValue}>{numberFormatter.format(item.count)}</span>
                  </div>
                  <div className={styles.chartBar}>
                    <span
                      className={styles.chartBarFill}
                      style={{ width: `${getBarWidth(item.count, resolvedWorkloadMax)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className={styles.listCard}>
          <header className={styles.listHeader}>
            <div>
              <p className={styles.listTitle}>Tickets by type</p>
              <p className={styles.listSubtitle}>Active tickets only · All time</p>
            </div>
          </header>
          {metricsToRender.openByIssueType.length === 0 ? (
            <p className={styles.emptyState}>No active tickets found.</p>
          ) : (
            <ul className={styles.listItems}>
              {metricsToRender.openByIssueType.map((item) => (
                <li key={item.issueType} className={styles.listItem}>
                  <div className={styles.listItemHeader}>
                    <span className={styles.listLabel}>{item.issueType}</span>
                    <span className={styles.listValue}>{numberFormatter.format(item.count)}</span>
                  </div>
                  <div className={styles.chartBar}>
                    <span className={styles.chartBarFill} style={{ width: `${getBarWidth(item.count, issueTypeMax)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}

function getMaxCount<T extends { count: number }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, item.count), 0);
}

function getBarWidth(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  const percent = (value / max) * 100;
  return Math.max(percent, 6);
}
