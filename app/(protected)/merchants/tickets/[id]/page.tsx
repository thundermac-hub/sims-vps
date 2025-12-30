import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import ticketStyles from '../../../tickets/tickets.module.css';
import styles from '../../../tickets/[id]/ticket-detail.module.css';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessSupportPages, canAccessTicketsPages } from '@/lib/branding';
import { fetchCsatResponseByRequest, fetchRequestByIdWithSignedUrl } from '@/lib/requests';
import { listUsers } from '@/lib/users';
import { formatDate, formatUserDisplayName, resolveUserDisplay } from '../../../tickets/utils';

export const dynamic = 'force-dynamic';

const formatValue = (value: string | null | undefined): string => {
  const cleaned = (value ?? '').trim();
  return cleaned || '-';
};

const formatDuration = (start: Date, end: Date): string => {
  const diff = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
};

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthenticatedUser();
  if (!canAccessTicketsPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }
  const canSeeTicketsList = canAccessSupportPages(authUser.department, authUser.isSuperAdmin);

  const resolvedParams = await params;
  const idValue = Number(resolvedParams.id);
  if (!Number.isFinite(idValue) || idValue <= 0) {
    notFound();
  }

  const ticket = await fetchRequestByIdWithSignedUrl(idValue);
  if (!ticket) {
    notFound();
  }

  const allUsers = await listUsers();
  const userDisplayById = new Map(
    allUsers.map((user) => {
      const label = user.name?.trim() || formatUserDisplayName(user.email) || user.email || `User #${user.id}`;
      return [String(user.id), label];
    }),
  );
  const updatedByDisplay = resolveUserDisplay(ticket.updated_by ?? null, userDisplayById);
  const assignedMsPic =
    ticket.ms_pic_user_id != null
      ? userDisplayById.get(String(ticket.ms_pic_user_id)) ?? `User #${ticket.ms_pic_user_id}`
      : 'Unassigned';

  const csatResponse = await fetchCsatResponseByRequest(ticket.id);
  const attachments = ticket.attachmentDownloadUrls;
  const hasAttachments = attachments.length > 0;
  const createdAtDisplay = formatDate(ticket.created_at);
  const updatedAtDisplay = formatDate(ticket.updated_at);
  const closedAtDisplay = ticket.closed_at ? formatDate(ticket.closed_at) : null;
  const resolutionDuration = ticket.closed_at ? formatDuration(ticket.created_at, ticket.closed_at) : null;
  const statusKey = `status${ticket.status.replace(/\s+/g, '')}`;
  const fidHref = ticket.fid?.trim()
    ? `https://cloud.getslurp.com/batcave/franchise/${encodeURIComponent(ticket.fid.trim())}`
    : null;
  const franchiseDisplay = ticket.franchise_name_resolved?.trim() || 'Outlet Not Found';
  const outletDisplay = ticket.outlet_name_resolved?.trim() || ticket.outlet_name?.trim() || 'Outlet Not Found';
  const csatSubmittedAt = csatResponse?.submitted_at ? formatDate(new Date(csatResponse.submitted_at)) : null;

  return (
    <div className={ticketStyles.page}>
      <section className={ticketStyles.hero}>
        <div className={ticketStyles.heroTop}>
          <div>
            <h1 className={ticketStyles.heroTitle}>Ticket #{ticket.id}</h1>
            <p className={ticketStyles.heroSubtitle}>
              Created {createdAtDisplay} · Updated {updatedAtDisplay}
              {updatedByDisplay ? ` by ${updatedByDisplay}` : ''}
            </p>
          </div>
          <div className={styles.heroActions}>
            {canSeeTicketsList ? (
              <Link className={styles.heroLink} href="/tickets">
                Back to Tickets
              </Link>
            ) : null}
            <Link className={styles.heroLink} href="/merchants">
              Back to Merchants
            </Link>
            {ticket.fid ? (
              <Link className={styles.heroLink} href={`/merchants/${encodeURIComponent(ticket.fid)}`}>
                View Franchise
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className={ticketStyles.tableCard}>
        <div className={ticketStyles.tableHeader}>
          <h2>Ticket Details</h2>
          <span>{ticket.status}</span>
        </div>
        <div className={`${ticketStyles.modalBody} ${styles.detailBody}`}>
          <div className={ticketStyles.modalInfoRow}>
            <div className={`${ticketStyles.modalInfoChip} ${ticketStyles.modalStatusChip} ${styles.detailInfoChip}`}>
              <div className={ticketStyles.statusWithPic}>
                <span className={`${ticketStyles.statusBadge} ${ticketStyles[statusKey]}`}>{ticket.status}</span>
                {closedAtDisplay ? (
                  <span className={ticketStyles.statusTooltip}>
                    Resolved: {closedAtDisplay}
                    {resolutionDuration ? (
                      <>
                        <br />
                        Duration: {resolutionDuration}
                      </>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </div>
            <div className={`${ticketStyles.modalInfoChip} ${styles.detailInfoChip}`}>
              <strong>Attachments</strong>
              {hasAttachments ? (
                <div className={ticketStyles.attachmentLinks}>
                  {attachments.map((url, index) => (
                    <span key={url} className={ticketStyles.attachmentLinkWrapper}>
                      {index > 0 ? <span className={ticketStyles.attachmentSeparator}>•</span> : null}
                      <a href={url} target="_blank" rel="noreferrer">
                        File {index + 1}
                      </a>
                    </span>
                  ))}
                </div>
              ) : (
                '—'
              )}
            </div>
            <div className={`${ticketStyles.modalInfoChip} ${styles.detailInfoChip}`}>
              <strong>ClickUp</strong>
              {ticket.clickup_link ? (
                <a href={ticket.clickup_link} target="_blank" rel="noreferrer">
                  View task
                </a>
              ) : (
                '—'
              )}
            </div>
            <div className={`${ticketStyles.modalInfoChip} ${styles.detailInfoChip}`}>
              <strong>Assigned MS PIC</strong>
              {assignedMsPic}
            </div>
          </div>

          <div className={ticketStyles.modalForm}>
            <section className={ticketStyles.modalGroup}>
              <div className={ticketStyles.modalGroupHeader}>
                <h4 className={ticketStyles.modalGroupTitle}>Contact Information</h4>
                <p className={`${ticketStyles.modalGroupDescription} ${styles.detailGroupDescription}`}>
                  Primary contact and resolved franchise/outlet details.
                </p>
              </div>
              <div className={ticketStyles.modalGroupBody}>
                <div className={ticketStyles.modalGrid}>
                  <div className={ticketStyles.modalField}>
                    <label>Merchant Name</label>
                    <div className={ticketStyles.readonlyValue}>{formatValue(ticket.merchant_name)}</div>
                  </div>
                  <div className={ticketStyles.modalField}>
                    <label>Phone Number</label>
                    <div className={ticketStyles.readonlyValue}>{formatValue(ticket.phone_number)}</div>
                  </div>
                  <div className={ticketStyles.modalField}>
                    <label>Franchise</label>
                    <div className={ticketStyles.readonlyValue}>{franchiseDisplay}</div>
                  </div>
                  <div className={ticketStyles.modalField}>
                    <label>Outlet</label>
                    <div className={ticketStyles.readonlyValue}>{outletDisplay}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className={ticketStyles.modalGroup}>
              <div className={ticketStyles.modalGroupHeader}>
                <h4 className={ticketStyles.modalGroupTitle}>CSAT Survey</h4>
                <p className={`${ticketStyles.modalGroupDescription} ${styles.detailGroupDescription}`}>
                  Customer satisfaction response details for this ticket.
                </p>
              </div>
              <div className={ticketStyles.modalGroupBody}>
                <div className={ticketStyles.csatPanel}>
                  <div className={ticketStyles.csatStatusBlock}>
                    <p className={`${ticketStyles.csatStatus} ${styles.detailCsatStatus}`}>
                      {csatResponse ? 'CSAT response received' : 'No CSAT response'}
                    </p>
                    <p className={`${ticketStyles.csatMeta} ${styles.detailCsatMeta}`}>
                      {csatResponse ? (csatSubmittedAt ? `Submitted ${csatSubmittedAt}` : 'Submitted') : 'No response'}
                    </p>
                  </div>
                  {csatResponse ? (
                    <div className={ticketStyles.modalGrid}>
                      <div className={ticketStyles.modalField}>
                        <label>Support Score</label>
                        <div className={ticketStyles.readonlyValue}>{csatResponse.support_score || '-'}</div>
                      </div>
                      <div className={ticketStyles.modalField}>
                        <label>Support Comment</label>
                        <div className={ticketStyles.readonlyValue}>{csatResponse.support_reason || '-'}</div>
                      </div>
                      <div className={ticketStyles.modalField}>
                        <label>Product Score</label>
                        <div className={ticketStyles.readonlyValue}>{csatResponse.product_score || '-'}</div>
                      </div>
                      <div className={ticketStyles.modalField}>
                        <label>Product Feedback</label>
                        <div className={ticketStyles.readonlyValue}>{csatResponse.product_feedback || '-'}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className={ticketStyles.modalGroup}>
              <div className={ticketStyles.modalGroupHeader}>
                <h4 className={ticketStyles.modalGroupTitle}>Ticket Metadata</h4>
                <p className={`${ticketStyles.modalGroupDescription} ${styles.detailGroupDescription}`}>
                  Internal identifiers and current status for this request.
                </p>
              </div>
              <div className={ticketStyles.modalGroupBody}>
                <div className={ticketStyles.modalGrid}>
                  <div className={ticketStyles.modalField}>
                    <label>FID</label>
                    <div className={ticketStyles.inputWithAction}>
                      <div className={`${ticketStyles.readonlyValue} ${styles.readonlyValueFlex}`}>
                        {formatValue(ticket.fid)}
                      </div>
                      {fidHref ? (
                        <a className={ticketStyles.batcaveButton} href={fidHref} target="_blank" rel="noreferrer">
                          Open Batcave
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className={ticketStyles.modalField}>
                    <label>OID</label>
                    <div className={ticketStyles.readonlyValue}>{formatValue(ticket.oid)}</div>
                  </div>
                  <div className={ticketStyles.modalField}>
                    <label>Assigned MS PIC</label>
                    <div className={ticketStyles.readonlyValue}>{assignedMsPic}</div>
                  </div>
                  <div className={ticketStyles.modalField}>
                    <label>Status</label>
                    <div className={ticketStyles.readonlyValue}>{ticket.status}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className={ticketStyles.modalGroup}>
              <div className={ticketStyles.modalGroupHeader}>
                <h4 className={ticketStyles.modalGroupTitle}>ClickUp Integration</h4>
                <p className={`${ticketStyles.modalGroupDescription} ${styles.detailGroupDescription}`}>
                  Current task linkage and status.
                </p>
              </div>
              <div className={`${ticketStyles.modalGroupBody} ${ticketStyles.clickupGroup}`}>
                <div className={ticketStyles.clickupSummary}>
                  <div className={ticketStyles.clickupSummaryDetails}>
                    <span className={`${ticketStyles.clickupSummaryLabel} ${styles.detailClickupLabel}`}>Current task</span>
                    {ticket.clickup_link ? (
                      <a className={ticketStyles.clickupSummaryLink} href={ticket.clickup_link} target="_blank" rel="noreferrer">
                        Open task
                      </a>
                    ) : (
                      <span className={ticketStyles.clickupUnavailable}>No task linked</span>
                    )}
                  </div>
                  <div className={ticketStyles.clickupStatusBlock}>
                    <span className={`${ticketStyles.clickupSummaryLabel} ${styles.detailClickupLabel}`}>Status</span>
                    <span className={ticketStyles.clickupStatusBadge}>{ticket.clickup_task_status ?? '—'}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className={ticketStyles.modalGroup}>
              <div className={ticketStyles.modalGroupHeader}>
                <h4 className={ticketStyles.modalGroupTitle}>Issue Details</h4>
                <p className={`${ticketStyles.modalGroupDescription} ${styles.detailGroupDescription}`}>
                  Summarise what happened and provide supporting context.
                </p>
              </div>
              <div className={ticketStyles.modalGroupBody}>
                <div className={ticketStyles.modalGrid}>
                  <div className={ticketStyles.modalField}>
                    <label>Category</label>
                    <div className={ticketStyles.readonlyValue}>{formatValue(ticket.issue_type)}</div>
                  </div>
                  <div className={ticketStyles.modalField}>
                    <label>Subcategory 1</label>
                    <div className={ticketStyles.readonlyValue}>{formatValue(ticket.issue_subcategory1)}</div>
                  </div>
                  <div className={ticketStyles.modalField}>
                    <label>Subcategory 2</label>
                    <div className={ticketStyles.readonlyValue}>{formatValue(ticket.issue_subcategory2)}</div>
                  </div>
                  <div className={`${ticketStyles.modalField} ${ticketStyles.modalFieldFull}`}>
                    <label>Issue Description</label>
                    <div className={ticketStyles.readonlyValue}>{formatValue(ticket.issue_description)}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className={ticketStyles.modalGroup}>
              <div className={ticketStyles.modalGroupHeader}>
                <h4 className={ticketStyles.modalGroupTitle}>Internal Notes</h4>
                <p className={`${ticketStyles.modalGroupDescription} ${styles.detailGroupDescription}`}>
                  Optional notes for the Merchant Success team.
                </p>
              </div>
              <div className={ticketStyles.modalGroupBody}>
                <div className={ticketStyles.modalGrid}>
                  <div className={`${ticketStyles.modalField} ${ticketStyles.modalFieldFull}`}>
                    <label>Ticket Notes</label>
                    <div className={ticketStyles.readonlyValue}>{formatValue(ticket.ticket_description)}</div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
