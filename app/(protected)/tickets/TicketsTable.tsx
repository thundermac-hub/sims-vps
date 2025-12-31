'use client';

import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import TicketViewButton from './TicketViewButton';
import styles from './tickets.module.css';
import sortStyles from '../merchants/merchants.module.css';

type SortKey = 'id' | 'merchant' | 'contact' | 'fid' | 'issue' | 'clickup' | 'status' | 'created';
type SortDirection = 'asc' | 'desc';

type TicketPayload = ComponentProps<typeof TicketViewButton>['ticket'];

type TicketTableRow = {
  id: number;
  franchiseName: string;
  outletName: string;
  contactName: string;
  phoneNumber: string;
  whatsappHref: string;
  fid: string;
  fidHref: string | null;
  oid: string;
  issueType: string;
  issueSubcategoryLabel: string;
  clickupLink: string | null;
  clickupStatus: string | null;
  status: string;
  msPicDisplay: string;
  createdAtLabel: string;
  createdAtMs: number;
  closedAtLabel: string | null;
  durationLabel: string | null;
  ticketPayload: TicketPayload;
  franchiseResolved: string | null;
  outletResolved: string | null;
  showAttend: boolean;
};

interface TicketsTableProps {
  rows: TicketTableRow[];
  statusOptions: ComponentProps<typeof TicketViewButton>['statusOptions'];
  timezone: string;
  categoryOptions: ComponentProps<typeof TicketViewButton>['categoryOptions'];
  userDisplayById: ComponentProps<typeof TicketViewButton>['userDisplayById'];
  onSave: ComponentProps<typeof TicketViewButton>['onSave'];
  onCreateClickUpTask: ComponentProps<typeof TicketViewButton>['onCreateClickUpTask'];
  onLinkClickUpTask: ComponentProps<typeof TicketViewButton>['onLinkClickUpTask'];
  onUnlinkClickUpTask: ComponentProps<typeof TicketViewButton>['onUnlinkClickUpTask'];
  onRefreshClickUpStatus: ComponentProps<typeof TicketViewButton>['onRefreshClickUpStatus'];
  onMarkCsatWhatsappSent: ComponentProps<typeof TicketViewButton>['onMarkCsatWhatsappSent'];
  clickupEnabled: boolean;
  canHideTicket: boolean;
  onHideTicket: ComponentProps<typeof TicketViewButton>['onHideTicket'];
  onAttendTicket: (formData: FormData) => void | Promise<void>;
}

const STATUS_ORDER = ['Open', 'In Progress', 'Pending Customer', 'Resolved'];

const compareStrings = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

const compareNumbers = (left: number, right: number): number => left - right;

export default function TicketsTable({
  rows,
  statusOptions,
  timezone,
  categoryOptions,
  userDisplayById,
  onSave,
  onCreateClickUpTask,
  onLinkClickUpTask,
  onUnlinkClickUpTask,
  onRefreshClickUpStatus,
  onMarkCsatWhatsappSent,
  clickupEnabled,
  canHideTicket,
  onHideTicket,
  onAttendTicket,
}: TicketsTableProps) {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'created',
    direction: 'desc',
  });

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      let result = 0;
      switch (sortConfig.key) {
        case 'id':
          result = compareNumbers(a.id, b.id);
          break;
        case 'merchant': {
          const franchiseCompare = compareStrings(a.franchiseName, b.franchiseName);
          result = franchiseCompare !== 0 ? franchiseCompare : compareStrings(a.outletName, b.outletName);
          break;
        }
        case 'contact': {
          const contactCompare = compareStrings(a.contactName, b.contactName);
          result = contactCompare !== 0 ? contactCompare : compareStrings(a.phoneNumber, b.phoneNumber);
          break;
        }
        case 'fid': {
          const fidCompare = compareStrings(a.fid, b.fid);
          result = fidCompare !== 0 ? fidCompare : compareStrings(a.oid, b.oid);
          break;
        }
        case 'issue':
          result = compareStrings(a.issueType, b.issueType);
          break;
        case 'clickup': {
          const leftHas = Boolean(a.clickupLink);
          const rightHas = Boolean(b.clickupLink);
          if (leftHas !== rightHas) {
            result = leftHas ? -1 : 1;
            break;
          }
          const leftStatus = a.clickupStatus ?? '';
          const rightStatus = b.clickupStatus ?? '';
          result = compareStrings(leftStatus, rightStatus);
          break;
        }
        case 'status': {
          const leftIndex = STATUS_ORDER.indexOf(a.status);
          const rightIndex = STATUS_ORDER.indexOf(b.status);
          const leftOrder = leftIndex === -1 ? STATUS_ORDER.length : leftIndex;
          const rightOrder = rightIndex === -1 ? STATUS_ORDER.length : rightIndex;
          result = compareNumbers(leftOrder, rightOrder);
          break;
        }
        case 'created':
          result = compareNumbers(a.createdAtMs, b.createdAtMs);
          break;
        default:
          result = 0;
      }
      return sortConfig.direction === 'asc' ? result : -result;
    });
    return next;
  }, [rows, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      const direction = key === 'id' || key === 'created' ? 'desc' : 'asc';
      return { key, direction };
    });
  };

  const ariaSort = (key: SortKey) =>
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th aria-sort={ariaSort('id')}>
              <button type="button" className={sortStyles.sortButton} onClick={() => handleSort('id')}>
                ID
                <SortIcon active={sortConfig.key === 'id'} direction={sortConfig.direction} />
              </button>
            </th>
            <th aria-sort={ariaSort('merchant')}>
              <button type="button" className={sortStyles.sortButton} onClick={() => handleSort('merchant')}>
                Merchant / Outlet
                <SortIcon active={sortConfig.key === 'merchant'} direction={sortConfig.direction} />
              </button>
            </th>
            <th aria-sort={ariaSort('contact')}>
              <button type="button" className={sortStyles.sortButton} onClick={() => handleSort('contact')}>
                Contact
                <SortIcon active={sortConfig.key === 'contact'} direction={sortConfig.direction} />
              </button>
            </th>
            <th aria-sort={ariaSort('fid')}>
              <button type="button" className={sortStyles.sortButton} onClick={() => handleSort('fid')}>
                FID / OID
                <SortIcon active={sortConfig.key === 'fid'} direction={sortConfig.direction} />
              </button>
            </th>
            <th aria-sort={ariaSort('issue')}>
              <button type="button" className={sortStyles.sortButton} onClick={() => handleSort('issue')}>
                Issue
                <SortIcon active={sortConfig.key === 'issue'} direction={sortConfig.direction} />
              </button>
            </th>
            <th aria-sort={ariaSort('clickup')}>
              <button type="button" className={sortStyles.sortButton} onClick={() => handleSort('clickup')}>
                ClickUp
                <SortIcon active={sortConfig.key === 'clickup'} direction={sortConfig.direction} />
              </button>
            </th>
            <th aria-sort={ariaSort('status')}>
              <button type="button" className={sortStyles.sortButton} onClick={() => handleSort('status')}>
                Status
                <SortIcon active={sortConfig.key === 'status'} direction={sortConfig.direction} />
              </button>
            </th>
            <th aria-sort={ariaSort('created')}>
              <button type="button" className={sortStyles.sortButton} onClick={() => handleSort('created')}>
                Created
                <SortIcon active={sortConfig.key === 'created'} direction={sortConfig.direction} />
              </button>
            </th>
            <th className={styles.tableHeaderNormal}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={9} className={styles.empty}>
                No support requests found.
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => {
              const statusKey = `status${row.status.replace(/\s+/g, '')}`;
              return (
                <tr key={row.id}>
                  <td data-label="ID">#{row.id}</td>
                  <td data-label="Merchant / Outlet">
                    <div className={styles.stackedCell}>
                      <span className={styles.primaryText}>{row.franchiseName}</span>
                      <span className={styles.secondaryText}>{row.outletName}</span>
                    </div>
                  </td>
                  <td data-label="Contact">
                    <div className={styles.stackedCell}>
                      <span className={styles.primaryText}>{row.contactName}</span>
                      <a className={styles.contactLink} href={row.whatsappHref} target="_blank" rel="noreferrer">
                        {row.phoneNumber}
                      </a>
                    </div>
                  </td>
                  <td data-label="FID / OID">
                    <div className={styles.stackedCell}>
                      {row.fidHref ? (
                        <a className={styles.idLink} href={row.fidHref} target="_blank" rel="noreferrer">
                          {row.fid}
                        </a>
                      ) : (
                        <span className={styles.idLink}>{row.fid}</span>
                      )}
                      <span className={styles.secondaryText}>{row.oid}</span>
                    </div>
                  </td>
                  <td data-label="Issue">
                    <div className={styles.stackedCell}>
                      <span className={styles.primaryText}>{row.issueType}</span>
                      <span className={styles.secondaryText}>{row.issueSubcategoryLabel}</span>
                    </div>
                  </td>
                  <td data-label="ClickUp">
                    {row.clickupLink ? (
                      <div className={styles.clickupCell}>
                        <a href={row.clickupLink} target="_blank" rel="noreferrer">
                          Task
                        </a>
                        {row.clickupStatus ? (
                          <span className={styles.clickupStatus}>{row.clickupStatus}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className={styles.clickupUnavailable}>-</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <div className={styles.statusWithPic}>
                      <span className={`${styles.statusBadge} ${styles[statusKey]}`}>{row.status}</span>
                      <span className={styles.statusMsPic}>{row.msPicDisplay}</span>
                      {row.closedAtLabel && row.durationLabel ? (
                        <span className={styles.statusTooltip}>
                          Resolved: {row.closedAtLabel}
                          <br />
                          Duration: {row.durationLabel}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td data-label="Created">
                    <span className={styles.noWrap}>{row.createdAtLabel}</span>
                  </td>
                  <td data-label="Actions">
                    <div className={styles.actionsCell}>
                      {row.showAttend ? (
                        <form action={onAttendTicket}>
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className={styles.attendButton}>
                            Attend
                          </button>
                        </form>
                      ) : null}
                      <TicketViewButton
                        ticket={row.ticketPayload}
                        statusOptions={statusOptions}
                        timezone={timezone}
                        categoryOptions={categoryOptions}
                        userDisplayById={userDisplayById}
                        franchiseResolved={row.franchiseResolved}
                        outletResolved={row.outletResolved}
                        onSave={onSave}
                        onCreateClickUpTask={onCreateClickUpTask}
                        onLinkClickUpTask={onLinkClickUpTask}
                        onUnlinkClickUpTask={onUnlinkClickUpTask}
                        onRefreshClickUpStatus={onRefreshClickUpStatus}
                        onMarkCsatWhatsappSent={onMarkCsatWhatsappSent}
                        clickupEnabled={clickupEnabled}
                        canHideTicket={canHideTicket}
                        onHideTicket={onHideTicket}
                      />
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <span className={sortStyles.sortIcon} aria-hidden="true">
      <svg viewBox="0 0 16 16" role="presentation">
        <path
          className={active && direction === 'asc' ? sortStyles.sortArrowActive : sortStyles.sortArrow}
          d="M8 3l3 3H5l3-3Z"
        />
        <path
          className={active && direction === 'desc' ? sortStyles.sortArrowActive : sortStyles.sortArrow}
          d="M8 13l-3-3h6l-3 3Z"
        />
      </svg>
    </span>
  );
}
