import { redirect } from 'next/navigation';
import styles from './csat.module.css';
import CsatAutoRefresh from './CsatAutoRefresh';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages } from '@/lib/branding';
import { getCsatAnalytics, CSAT_SCORES, type CsatAnalytics, type CsatScore } from '@/lib/csat';

export const dynamic = 'force-dynamic';

function getMaxCount(breakdown: Record<CsatScore, number>): number {
  return Math.max(...CSAT_SCORES.map((score) => breakdown[score] ?? 0), 1);
}

function getPercent(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

const createEmptyBreakdown = () =>
  CSAT_SCORES.reduce<Record<CsatScore, number>>((acc, score) => {
    acc[score] = 0;
    return acc;
  }, {} as Record<CsatScore, number>);

const EMPTY_ANALYTICS: CsatAnalytics = {
  totalResponses: 0,
  resolvedCount: null,
  sentCount: null,
  responseRate: null,
  supportBreakdown: createEmptyBreakdown(),
  productBreakdown: createEmptyBreakdown(),
  averageSupportScore: null,
  averageProductScore: null,
  recentFeedback: [],
};

export default async function CsatDashboardPage() {
  const authUser = await getAuthenticatedUser();
  if (!canAccessSupportPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }

  let analytics: CsatAnalytics | null = null;
  try {
    analytics = await getCsatAnalytics();
  } catch (error) {
    console.error('Failed to load CSAT analytics', error);
  }
  const dataUnavailable = analytics === null;
  const analyticsToRender = analytics ?? EMPTY_ANALYTICS;
  const totalSupport = Object.values(analyticsToRender.supportBreakdown).reduce((sum, value) => sum + value, 0);
  const totalProduct = Object.values(analyticsToRender.productBreakdown).reduce((sum, value) => sum + value, 0);
  const supportMax = getMaxCount(analyticsToRender.supportBreakdown);
  const productMax = getMaxCount(analyticsToRender.productBreakdown);

  const responseRateDisplay =
    analyticsToRender.responseRate === null ? '—' : `${Math.round((analyticsToRender.responseRate ?? 0) * 100)}%`;
  const avgSupport = analyticsToRender.averageSupportScore ? `${analyticsToRender.averageSupportScore.toFixed(2)} / 4` : '—';
  const avgProduct = analyticsToRender.averageProductScore ? `${analyticsToRender.averageProductScore.toFixed(2)} / 4` : '—';
  const sentCountDisplay =
    typeof analyticsToRender.sentCount === 'number' ? analyticsToRender.sentCount.toLocaleString('en-MY') : '—';

  return (
    <div className={styles.page}>
      <CsatAutoRefresh interval={15000} />
      <section className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>CSAT Insights</h1>
          <p className={styles.heroSubtitle}>
            Track how merchants feel after their tickets are resolved. Survey links expire in 3 days; this view highlights
            response quality, sentiment trends, and the latest verbatim feedback.
          </p>
          {dataUnavailable ? (
            <p className={styles.errorNotice}>
              Unable to refresh CSAT data right now. Check your connection; auto-refresh will retry shortly.
            </p>
          ) : null}
        </div>
      </section>

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Total CSAT responses</p>
          <p className={styles.statValue}>{analyticsToRender.totalResponses.toLocaleString('en-MY')}</p>
          <p className={styles.statHint}>Submitted from resolved tickets</p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Response rate</p>
          <p className={styles.statValue}>{responseRateDisplay}</p>
          <p className={styles.statHint}>CSAT links sent: {sentCountDisplay}</p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Support satisfaction</p>
          <p className={styles.statValue}>{avgSupport}</p>
          <p className={styles.statHint}>Weighted 1 (Dissatisfied) → 4 (Very Satisfied)</p>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Product satisfaction</p>
          <p className={styles.statValue}>{avgProduct}</p>
          <p className={styles.statHint}>Weighted 1 (Dissatisfied) → 4 (Very Satisfied)</p>
        </article>
      </section>

      <section className={styles.breakdownRow}>
        <article className={styles.breakdownCard}>
          <header className={styles.cardHeader}>
            <div>
              <p className={styles.cardLabel}>Support team experience</p>
              <h3 className={styles.cardTitle}>How satisfied are merchants with Slurp Support?</h3>
            </div>
            <span className={styles.badge}>{totalSupport} responses</span>
          </header>
          <ul className={styles.breakdownList}>
            {CSAT_SCORES.map((score) => {
              const count = analyticsToRender.supportBreakdown[score] ?? 0;
              const width = count === 0 || supportMax === 0 ? 0 : Math.max(6, (count / supportMax) * 100);
              return (
                <li key={score} className={styles.breakdownItem}>
                  <div className={styles.breakdownRowHeader}>
                    <span>{score}</span>
                    <span className={styles.breakdownCount}>
                      {count} · {getPercent(count, totalSupport || 0)}
                    </span>
                  </div>
                  <div className={styles.breakdownBar}>
                    <span className={styles.breakdownFill} style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </article>

        <article className={styles.breakdownCard}>
          <header className={styles.cardHeader}>
            <div>
              <p className={styles.cardLabel}>Product experience</p>
              <h3 className={styles.cardTitle}>How satisfied are merchants with Slurp overall?</h3>
            </div>
            <span className={styles.badge}>{totalProduct} responses</span>
          </header>
          <ul className={styles.breakdownList}>
            {CSAT_SCORES.map((score) => {
              const count = analyticsToRender.productBreakdown[score] ?? 0;
              const width = count === 0 || productMax === 0 ? 0 : Math.max(6, (count / productMax) * 100);
              return (
                <li key={score} className={styles.breakdownItem}>
                  <div className={styles.breakdownRowHeader}>
                    <span>{score}</span>
                    <span className={styles.breakdownCount}>
                      {count} · {getPercent(count, totalProduct || 0)}
                    </span>
                  </div>
                  <div className={styles.breakdownBar}>
                    <span className={styles.breakdownFillAlt} style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
      </section>

      <section className={styles.feedbackSection}>
        <header className={styles.cardHeader}>
          <div>
            <p className={styles.cardLabel}>Verbatim feedback</p>
            <h3 className={styles.cardTitle}>What customers are telling us</h3>
          </div>
          <span className={styles.badge}>{analyticsToRender.recentFeedback.length} entries</span>
        </header>
        {analyticsToRender.recentFeedback.length === 0 ? (
          <p className={styles.emptyState}>No CSAT comments yet. Share the survey link after resolving tickets.</p>
        ) : (
          <ul className={styles.feedbackList}>
            {analyticsToRender.recentFeedback.map((item) => (
              <li key={item.id} className={styles.feedbackItem}>
                <div className={styles.feedbackMeta}>
                  <span className={styles.feedbackName}>
                    {item.merchantName || 'Merchant'} · {item.outletName || 'Outlet'}
                  </span>
                  <span className={styles.feedbackDate}>
                    {new Date(item.submittedAt).toLocaleString('en-MY', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                  <span className={styles.feedbackTag}>Ticket #{item.requestId}</span>
                </div>
                <div className={styles.feedbackBody}>
                  {item.supportReason ? (
                    <p>
                      <strong>Support:</strong> {item.supportReason}
                    </p>
                  ) : null}
                  {item.productFeedback ? (
                    <p>
                      <strong>Product:</strong> {item.productFeedback}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
