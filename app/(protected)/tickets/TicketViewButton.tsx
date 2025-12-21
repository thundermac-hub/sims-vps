'use client';

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import styles from './tickets.module.css';
import type { ClickUpActionResult } from './types';

interface TicketPayload {
  id: number;
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
  ticketDescription: string;
  clickupLink: string | null;
  clickupStatus: string | null;
  attachmentDownloadUrls: string[];
  status: string;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  updatedByName: string | null;
  msPicUserId: number | null;
  msPicDisplayName: string | null;
  msPicOptions: Array<{ id: number; label: string }>;
  franchiseResolved: string | null;
  outletResolved: string | null;
  categoryOptions: Array<{
    category: string;
    subcategories: { name: string; subcategories: string[] }[];
  }>;
  userDisplayById: Map<string, string>;
  csatToken: string | null;
  csatExpiresAt: string | null;
  csatSubmittedAt: string | null;
  csatIsExpired: boolean;
  hidden: boolean;
}

interface TicketViewButtonProps {
  ticket: TicketPayload;
  statusOptions: readonly string[];
  timezone: string;
  categoryOptions: Array<{
    category: string;
    subcategories: { name: string; subcategories: string[] }[];
  }>;
  userDisplayById: Map<string, string>;
  onSave: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  onCreateClickUpTask: (formData: FormData) => Promise<ClickUpActionResult>;
  onLinkClickUpTask: (formData: FormData) => Promise<ClickUpActionResult>;
  onUnlinkClickUpTask: (formData: FormData) => Promise<ClickUpActionResult>;
  onRefreshClickUpStatus: (formData: FormData) => Promise<ClickUpActionResult>;
  clickupEnabled: boolean;
  franchiseResolved: string | null;
  outletResolved: string | null;
  canHideTicket: boolean;
  onHideTicket?: (formData: FormData) => void | Promise<void>;
  onMarkCsatWhatsappSent: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
}

const HISTORY_FIELD_LABELS: Record<string, string> = {
  merchant_name: 'Merchant Name',
  outlet_name: 'Outlet Name',
  phone_number: 'Phone Number',
  email: 'Email',
  fid: 'FID',
  oid: 'OID',
  issue_type: 'Issue Type',
  issue_subcategory1: 'Issue Subcategory 1',
  issue_subcategory2: 'Issue Subcategory 2',
  issue_description: 'Issue Description',
  ticket_description: 'Ticket Description',
  status: 'Status',
  clickup_link: 'ClickUp Link',
  clickup_task_id: 'ClickUp Task ID',
  clickup_task_status: 'ClickUp Status',
  ms_pic_user_id: 'Assigned MS PIC',
  franchise_name_resolved: 'Franchise',
  outlet_name_resolved: 'Outlet',
  hidden: 'Archived',
};

function formatHistoryField(field: string): string {
  if (HISTORY_FIELD_LABELS[field]) {
    return HISTORY_FIELD_LABELS[field];
  }
  const spaced = field.replace(/_/g, ' ').trim();
  if (!spaced) return field;
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatHistoryUser(identifier: string | null, userDisplayById: Map<string, string>): string {
  if (!identifier) {
    return 'Unknown user';
  }
  const mapped = userDisplayById.get(String(identifier));
  if (mapped) {
    return mapped;
  }
  const trimmed = identifier.trim();
  if (!trimmed) {
    return 'Unknown user';
  }
  if (trimmed.includes('@')) {
    const [localPart] = trimmed.split('@');
    const words = localPart.replace(/[\.\-_]+/g, ' ').split(' ').filter(Boolean);
    if (words.length > 0) {
      return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
  }
  return 'Unknown user';
}

function formatHistoryValue(field: string, value: string | null, userDisplayById: Map<string, string>): string {
  if (field === 'ms_pic_user_id') {
    if (!value) return '—';
    const mapped = userDisplayById.get(String(value));
    if (mapped) return mapped;
    const fallback = formatHistoryUser(value, userDisplayById);
    return fallback === 'Unknown user' ? '—' : fallback;
  }
  if (field === 'hidden') {
    if (value === 'true') return 'Archived';
    if (value === 'false') return 'Active';
  }
  return value ?? '—';
}

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return '–';
  }
  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

interface FormState {
  merchantName: string;
  outletName: string;
  phoneNumber: string;
  email: string;
  fid: string;
  oid: string;
  issueType: string;
  issueSubcategory1: string;
  issueSubcategory2: string;
  issueDescription: string;
  ticketDescription: string;
  status: string;
  clickupLink: string;
  msPicUserId: string;
}

interface CsatState {
  token: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
  isExpired: boolean;
}

export default function TicketViewButton({
  ticket,
  statusOptions,
  timezone,
  onSave,
  onCreateClickUpTask,
  onLinkClickUpTask,
  onUnlinkClickUpTask,
  onRefreshClickUpStatus,
  clickupEnabled,
  franchiseResolved,
  outletResolved,
  categoryOptions,
  userDisplayById,
  canHideTicket,
  onHideTicket,
  onMarkCsatWhatsappSent,
}: TicketViewButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(() => ({
    merchantName: ticket.merchantName,
    outletName: ticket.outletName,
    phoneNumber: ticket.phoneNumber,
    email: ticket.email ?? '',
    fid: ticket.fid,
    oid: ticket.oid,
    issueType: ticket.issueType,
    issueSubcategory1: ticket.issueSubcategory1 ?? '',
    issueSubcategory2: ticket.issueSubcategory2 ?? '',
    issueDescription: ticket.issueDescription,
    ticketDescription: ticket.ticketDescription,
    status: ticket.status,
    clickupLink: ticket.clickupLink ?? '',
    msPicUserId: ticket.msPicUserId ? String(ticket.msPicUserId) : '',
  }));
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [clickupStatus, setClickupStatus] = useState<string | null>(ticket.clickupStatus ?? null);
  const [clickupFeedback, setClickupFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [clickupLinkInput, setClickupLinkInput] = useState('');
  const [activeClickUpAction, setActiveClickUpAction] = useState<'create' | 'link' | 'unlink' | 'refresh' | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isClickUpPending, startClickUpTransition] = useTransition();
  const [isCsatSharePending, startCsatShareTransition] = useTransition();
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<
    { field_name: string; old_value: string | null; new_value: string | null; changed_at: string; changed_by: string | null }[]
  >([]);
  const [csatState, setCsatState] = useState<CsatState>({
    token: ticket.csatToken,
    expiresAt: ticket.csatExpiresAt,
    submittedAt: ticket.csatSubmittedAt,
    isExpired: ticket.csatIsExpired,
  });
  const [csatCopyStatus, setCsatCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormState({
        merchantName: ticket.merchantName,
        outletName: ticket.outletName,
        phoneNumber: ticket.phoneNumber,
        email: ticket.email ?? '',
        fid: ticket.fid,
        oid: ticket.oid,
        issueType: ticket.issueType,
        issueSubcategory1: ticket.issueSubcategory1 ?? '',
        issueSubcategory2: ticket.issueSubcategory2 ?? '',
        issueDescription: ticket.issueDescription,
        ticketDescription: ticket.ticketDescription,
        status: ticket.status,
        clickupLink: ticket.clickupLink ?? '',
        msPicUserId: ticket.msPicUserId ? String(ticket.msPicUserId) : '',
      });
      setFeedback(null);
      setClickupStatus(ticket.clickupStatus ?? null);
      setClickupFeedback(null);
      setClickupLinkInput('');
      setActiveClickUpAction(null);
      setCsatState({
        token: ticket.csatToken,
        expiresAt: ticket.csatExpiresAt,
        submittedAt: ticket.csatSubmittedAt,
        isExpired: ticket.csatIsExpired,
      });
      setCsatCopyStatus(null);
    }
  }, [isOpen, ticket]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-MY', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
      }),
    [timezone],
  );

  const createdAtDisplay = useMemo(() => formatter.format(new Date(ticket.createdAt)), [formatter, ticket.createdAt]);
  const updatedAtDisplay = useMemo(() => formatter.format(new Date(ticket.updatedAt)), [formatter, ticket.updatedAt]);
  const closedAtDisplay = useMemo(
    () => (ticket.closedAt ? formatter.format(new Date(ticket.closedAt)) : null),
    [formatter, ticket.closedAt],
  );
  const resolutionDuration = useMemo(() => {
    if (!ticket.closedAt) return null;
    const start = new Date(ticket.createdAt);
    const end = new Date(ticket.closedAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const diff = Math.max(0, end.getTime() - start.getTime());
    return formatDuration(diff);
  }, [ticket.closedAt, ticket.createdAt]);
  const csatLink = useMemo(() => {
    if (!csatState.token) {
      return null;
    }
    if (typeof window === 'undefined') {
      return `/csat/${csatState.token}`;
    }
    return `${window.location.origin}/csat/${csatState.token}`;
  }, [csatState.token]);
  const csatWhatsappHref = useMemo(() => {
    if (!csatLink) return null;
    const phoneDigits = ticket.phoneNumber.replace(/\D/g, '');
    if (!phoneDigits) return null;
    const message = [
      'Hi! Thanks for contacting Merchant Success. We would love to hear your feedback. Please take a moment to share your experience with us.',
      '',
      csatLink,
    ].join('\n');
    return `https://api.whatsapp.com/send/?phone=${encodeURIComponent(phoneDigits)}&text=${encodeURIComponent(message)}`;
  }, [csatLink, ticket.phoneNumber]);
  const csatExpiresDisplay = useMemo(() => {
    if (!csatState.expiresAt) return null;
    const parsed = new Date(csatState.expiresAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatter.format(parsed);
  }, [csatState.expiresAt, formatter]);
  const csatSubmittedDisplay = useMemo(() => {
    if (!csatState.submittedAt) return null;
    const parsed = new Date(csatState.submittedAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatter.format(parsed);
  }, [csatState.submittedAt, formatter]);
  const csatStatusLabel = useMemo(() => {
    if (!csatState.token) {
      return 'No survey link yet';
    }
    if (csatState.submittedAt) {
      return csatSubmittedDisplay ? `Submitted on ${csatSubmittedDisplay}` : 'Submitted';
    }
    if (csatState.isExpired) {
      return 'Link expired';
    }
    if (csatExpiresDisplay) {
      return `Expires ${csatExpiresDisplay}`;
    }
    return 'Survey link active';
  }, [csatExpiresDisplay, csatState.isExpired, csatState.submittedAt, csatState.token, csatSubmittedDisplay]);
  const assignedMsPic = useMemo(
    () => {
      if (formState.msPicUserId) {
        const match = ticket.msPicOptions.find((option) => String(option.id) === formState.msPicUserId);
        if (match) {
          return match.label;
        }
      }
      return ticket.msPicDisplayName ?? 'Unassigned';
    },
    [formState.msPicUserId, ticket.msPicDisplayName, ticket.msPicOptions],
  );

  const franchiseDisplay = franchiseResolved?.trim() || 'Outlet Not Found';
  const outletDisplay = outletResolved?.trim() || 'Outlet Not Found';
  const fidHref =
    formState.fid?.trim()
      ? `https://cloud.getslurp.com/batcave/franchise/${encodeURIComponent(formState.fid.trim())}`
      : null;
  const subcategory1Options = useMemo(
    () => categoryOptions.find((option) => option.category === formState.issueType)?.subcategories ?? [],
    [categoryOptions, formState.issueType],
  );
  const subcategory2Options = useMemo(
    () =>
      subcategory1Options.find((sub) => sub.name === formState.issueSubcategory1)?.subcategories ?? [],
    [subcategory1Options, formState.issueSubcategory1],
  );

  const handleCategorySelect = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const { value } = event.target;
      setFormState((prev) => ({
        ...prev,
        issueType: value,
        issueSubcategory1: '',
        issueSubcategory2: '',
      }));
    },
    [setFormState],
  );

  const handleSubcategory1Select = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const { value } = event.target;
      setFormState((prev) => ({
        ...prev,
        issueSubcategory1: value,
        issueSubcategory2: '',
      }));
    },
    [setFormState],
  );

  const handleChange =
    (field: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { value } = event.target;
      setFormState((prev) => {
        const next = { ...prev, [field]: value };
        if (field === 'msPicUserId' && value && prev.status === 'Open') {
          next.status = 'In Progress';
        }
        return next;
      });
    };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData();
    formData.set('id', String(ticket.id));
    formData.set('merchant_name', formState.merchantName);
    formData.set('outlet_name', formState.outletName);
    formData.set('phone_number', formState.phoneNumber);
    formData.set('email', formState.email);
    formData.set('fid', formState.fid);
    formData.set('oid', formState.oid);
    formData.set('issue_type', formState.issueType);
    formData.set('issue_subcategory1', formState.issueSubcategory1);
    formData.set('issue_subcategory2', formState.issueSubcategory2);
    formData.set('issue_description', formState.issueDescription);
    formData.set('ticket_description', formState.ticketDescription);
    formData.set('status', formState.status);
    formData.set('clickup_link', formState.clickupLink);
    formData.set('ms_pic_user_id', formState.msPicUserId);
    formData.set('franchise_name_resolved', ticket.franchiseResolved ?? '');
    formData.set('outlet_name_resolved', ticket.outletResolved ?? '');

    startTransition(async () => {
      const result = await onSave(formData);
      if (!result.success) {
        const message = result.error ?? 'Failed to update ticket.';
        setFeedback({ type: 'error', message });
        setErrorDialog(message);
        return;
      }
      setFeedback({ type: 'success', message: 'Ticket updated successfully.' });
      router.refresh();
      setIsOpen(false);
    });
  };

  const handleClickUpLinkInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setClickupLinkInput(event.target.value);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tickets-modal-toggle', { detail: { open: isOpen } }));
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tickets-modal-toggle', { detail: { open: false } }));
      }
    };
  }, [isOpen]);

  const handleCreateClickUpTask = () => {
    if (!clickupEnabled || Boolean(formState.clickupLink) || isClickUpPending) {
      return;
    }
    const formData = new FormData();
    formData.set('id', String(ticket.id));
    setClickupFeedback(null);
    setActiveClickUpAction('create');
    startClickUpTransition(async () => {
      try {
        const result = await onCreateClickUpTask(formData);
        if (!result.success) {
          setClickupFeedback({ type: 'error', message: result.error ?? 'Failed to create ClickUp task.' });
          return;
        }
        setFormState((prev) => ({ ...prev, clickupLink: result.clickupLink ?? '' }));
        setClickupStatus(result.clickupStatus ?? null);
        setClickupFeedback({ type: 'success', message: 'ClickUp task created.' });
        router.refresh();
      } catch (error) {
        console.error('Failed to create ClickUp task', error);
        setClickupFeedback({ type: 'error', message: 'Failed to create ClickUp task. Please try again.' });
      } finally {
        setActiveClickUpAction(null);
      }
    });
  };

  const handleLinkClickUpTask = () => {
    if (!clickupLinkInput.trim() || isClickUpPending) {
      if (!clickupLinkInput.trim()) {
        setClickupFeedback({ type: 'error', message: 'Enter a ClickUp link or task ID.' });
      }
      return;
    }
    const formData = new FormData();
    formData.set('id', String(ticket.id));
    formData.set('clickup_link', clickupLinkInput.trim());
    setClickupFeedback(null);
    setActiveClickUpAction('link');
    startClickUpTransition(async () => {
      try {
        const result = await onLinkClickUpTask(formData);
        if (!result.success) {
          setClickupFeedback({ type: 'error', message: result.error ?? 'Failed to link ClickUp task.' });
          return;
        }
        setFormState((prev) => ({ ...prev, clickupLink: result.clickupLink ?? '' }));
        setClickupStatus(result.clickupStatus ?? null);
        setClickupFeedback({ type: 'success', message: 'ClickUp task linked.' });
        setClickupLinkInput('');
        router.refresh();
      } catch (error) {
        console.error('Failed to link ClickUp task', error);
        setClickupFeedback({ type: 'error', message: 'Failed to link ClickUp task. Please try again.' });
      } finally {
        setActiveClickUpAction(null);
      }
    });
  };

  const handleLinkInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLinkClickUpTask();
    }
  };

  const handleCopyCsatLink = async () => {
    if (!csatLink || csatState.isExpired || csatState.submittedAt) {
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCsatCopyStatus('Copy not available');
      return;
    }
    try {
      await navigator.clipboard.writeText(csatLink);
      setCsatCopyStatus('Copied');
    } catch (error) {
      console.error('Failed to copy CSAT link', error);
      setCsatCopyStatus('Copy failed');
    } finally {
      setTimeout(() => setCsatCopyStatus(null), 2000);
    }
  };

  const handleUnlinkClickUpTask = () => {
    if (!formState.clickupLink || isClickUpPending) {
      return;
    }
    const formData = new FormData();
    formData.set('id', String(ticket.id));
    setClickupFeedback(null);
    setActiveClickUpAction('unlink');
    startClickUpTransition(async () => {
      try {
        const result = await onUnlinkClickUpTask(formData);
        if (!result.success) {
          setClickupFeedback({ type: 'error', message: result.error ?? 'Failed to remove ClickUp link.' });
          return;
        }
        setFormState((prev) => ({ ...prev, clickupLink: result.clickupLink ?? '' }));
        setClickupStatus(result.clickupStatus ?? null);
        setClickupFeedback({ type: 'success', message: 'ClickUp link removed.' });
        router.refresh();
      } catch (error) {
        console.error('Failed to remove ClickUp link', error);
        setClickupFeedback({ type: 'error', message: 'Failed to remove ClickUp link. Please try again.' });
      } finally {
        setActiveClickUpAction(null);
      }
    });
  };

  const handleSendCsatViaWhatsapp = () => {
    if (!csatWhatsappHref || csatState.isExpired || csatState.submittedAt) {
      return;
    }
    if (typeof window !== 'undefined') {
      window.open(csatWhatsappHref, '_blank', 'noreferrer');
    }
    const formData = new FormData();
    formData.set('id', String(ticket.id));
    startCsatShareTransition(async () => {
      try {
        await onMarkCsatWhatsappSent(formData);
      } catch (error) {
        console.error('Failed to record CSAT WhatsApp send', error);
      }
    });
  };

  const csatActionsDisabled = useMemo(
    () => !csatState.token || csatState.isExpired || Boolean(csatState.submittedAt),
    [csatState.isExpired, csatState.submittedAt, csatState.token],
  );

  const handleRefreshClickUpStatus = () => {
    if (!formState.clickupLink || !clickupEnabled || isClickUpPending) {
      return;
    }
    const formData = new FormData();
    formData.set('id', String(ticket.id));
    setClickupFeedback(null);
    setActiveClickUpAction('refresh');
    startClickUpTransition(async () => {
      try {
        const result = await onRefreshClickUpStatus(formData);
        if (!result.success) {
          setClickupFeedback({ type: 'error', message: result.error ?? 'Failed to refresh ClickUp status.' });
          return;
        }
        setClickupStatus(result.clickupStatus ?? null);
        setClickupFeedback({ type: 'success', message: 'ClickUp status refreshed.' });
        router.refresh();
      } catch (error) {
        console.error('Failed to refresh ClickUp status', error);
        setClickupFeedback({ type: 'error', message: 'Failed to refresh ClickUp status. Please try again.' });
      } finally {
        setActiveClickUpAction(null);
      }
    });
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/admin/tickets/${ticket.id}/history`, { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error('Failed to load history');
      }
      const payload = (await response.json()) as {
        history?: {
          field_name: string;
          old_value: string | null;
          new_value: string | null;
          changed_at: string;
          changed_by: string | null;
        }[];
      };
      setHistoryEntries(payload.history ?? []);
    } catch (error) {
      console.error('Failed to fetch ticket history', error);
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHideTicket = useCallback(async () => {
    if (!onHideTicket) return;
    const fd = new FormData();
    fd.set('id', String(ticket.id));
    fd.set('mode', ticket.hidden ? 'unarchive' : 'archive');
    setIsOpen(false);
    await onHideTicket(fd);
    router.refresh();
  }, [onHideTicket, ticket.id, ticket.hidden, router]);

  const closeModal = () => {
    if (!isPending && !isClickUpPending) {
      setIsOpen(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.viewButton} onClick={() => setIsOpen(true)}>
        View
      </button>
      {isOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.modalContainer} role="dialog" aria-modal="true" aria-labelledby={`ticket-${ticket.id}`}>
            <header className={styles.modalHero}>
              <button type="button" className={styles.modalClose} onClick={closeModal} aria-label="Close ticket details">
                ×
              </button>
              <div className={styles.modalHeroBody}>
                <div className={styles.modalHeroContent}>
                  <p className={styles.modalHeroKicker}>Support Ticket</p>
                  <h3 id={`ticket-${ticket.id}`} className={styles.modalTitle}>
                    Ticket #{ticket.id}
                  </h3>
                  <p className={styles.modalMetaLine}>
                    Created {createdAtDisplay} · Updated {updatedAtDisplay}
                    {ticket.updatedByName ? ` by ${ticket.updatedByName}` : ''}
                  </p>
                </div>
              </div>
            </header>

            <div className={styles.modalBody}>
              <div className={styles.modalInfoRow}>
                <div className={`${styles.modalInfoChip} ${styles.modalStatusChip}`}>
                  <div className={styles.statusWithPic}>
                    <span className={`${styles.statusBadge} ${styles[`status${formState.status.replace(/\s+/g, '')}`]}`}>
                      {formState.status}
                    </span>
                    {closedAtDisplay ? (
                      <span className={styles.statusTooltip}>
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
                <div className={styles.modalInfoChip}>
                  <strong>Attachments</strong>
                  {ticket.attachmentDownloadUrls.length > 0 ? (
                    <div className={styles.attachmentLinks}>
                      {ticket.attachmentDownloadUrls.map((url, index) => (
                        <span key={url} className={styles.attachmentLinkWrapper}>
                          {index > 0 ? <span className={styles.attachmentSeparator}>•</span> : null}
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
                <div className={styles.modalInfoChip}>
                  <strong>ClickUp</strong>
                  {formState.clickupLink ? (
                    <a href={formState.clickupLink} target="_blank" rel="noreferrer">
                      View task
                    </a>
              ) : (
                '—'
              )}
            </div>
            <div className={styles.modalInfoChip}>
              <strong>Assigned MS PIC</strong>
              {assignedMsPic}
            </div>
          </div>

              {feedback ? (
                <div
                  className={`${styles.modalAlert} ${
                    feedback.type === 'success' ? styles.modalAlertSuccess : styles.modalAlertError
                  }`}
                >
                  {feedback.message}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className={styles.modalForm}>
                <section className={styles.modalGroup}>
                  <div className={styles.modalGroupHeader}>
                    <h4 className={styles.modalGroupTitle}>Contact Information</h4>
                    <p className={styles.modalGroupDescription}>Primary contact and resolved franchise/outlet details.</p>
                  </div>
                  <div className={styles.modalGroupBody}>
                    <div className={styles.modalGrid}>
                      <div className={styles.modalField}>
                        <label>
                          Merchant Name
                          <input
                            name="merchant_name"
                            value={formState.merchantName}
                            onChange={handleChange('merchantName')}
                            required
                          />
                        </label>
                      </div>
                      <div className={styles.modalField}>
                        <label>
                          Phone Number
                          <input
                            name="phone_number"
                            value={formState.phoneNumber}
                            onChange={handleChange('phoneNumber')}
                            required
                          />
                        </label>
                      </div>
                      <div className={styles.modalField}>
                        <label>Franchise</label>
                        <div className={styles.readonlyValue}>{franchiseDisplay}</div>
                      </div>
                      <div className={styles.modalField}>
                        <label>Outlet</label>
                        <div className={styles.readonlyValue}>{outletDisplay}</div>
                      </div>
                      <input type="hidden" name="outlet_name" value={formState.outletName ?? ''} />
                      <input type="hidden" name="email" value={formState.email ?? ''} />
                    </div>
                  </div>
                </section>

                <section className={styles.modalGroup}>
                  <div className={styles.modalGroupHeader}>
                    <h4 className={styles.modalGroupTitle}>CSAT Survey</h4>
                    <p className={styles.modalGroupDescription}>
                      Copy or open the customer satisfaction survey link for this ticket.
                    </p>
                  </div>
                  <div className={styles.modalGroupBody}>
                    <div className={styles.csatPanel}>
                      <div className={styles.csatStatusBlock}>
                        <p className={styles.csatStatus}>{csatStatusLabel}</p>
                        <p className={styles.csatMeta}>
                          {csatState.token
                            ? `Link: ${csatState.token.slice(0, 8)}…`
                            : 'No survey link available'}
                        </p>
                      </div>
                      <div className={styles.csatActions}>
                        <a
                          href={csatActionsDisabled ? '#' : csatLink ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            if (csatActionsDisabled || !csatLink) {
                              event.preventDefault();
                            }
                          }}
                          className={`${styles.csatLinkButton} ${
                            !csatState.token || csatActionsDisabled ? styles.csatLinkButtonDisabled : ''
                          }`}
                          aria-disabled={csatActionsDisabled}
                        >
                          Open link
                        </a>
                        <button
                          type="button"
                          className={styles.csatGhostButton}
                          onClick={handleCopyCsatLink}
                          disabled={csatActionsDisabled || !csatLink}
                        >
                          {csatCopyStatus ?? 'Copy link'}
                        </button>
                        <button
                          type="button"
                          className={styles.csatGhostButton}
                          onClick={handleSendCsatViaWhatsapp}
                          disabled={csatActionsDisabled || !csatWhatsappHref || isCsatSharePending}
                        >
                          Send via WhatsApp
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className={styles.modalGroup}>
                  <div className={styles.modalGroupHeader}>
                    <h4 className={styles.modalGroupTitle}>Ticket Metadata</h4>
                    <p className={styles.modalGroupDescription}>
                      Internal identifiers and current status for this request.
                    </p>
                  </div>
                  <div className={styles.modalGroupBody}>
                    <div className={styles.modalGrid}>
                      <div className={styles.modalField}>
                        <label htmlFor="fid-input">FID</label>
                        <div className={styles.inputWithAction}>
                          <input id="fid-input" name="fid" value={formState.fid} onChange={handleChange('fid')} />
                          {fidHref ? (
                            <a className={styles.batcaveButton} href={fidHref} target="_blank" rel="noreferrer">
                              Open Batcave
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <div className={styles.modalField}>
                        <label>
                          OID
                          <input name="oid" value={formState.oid} onChange={handleChange('oid')} />
                        </label>
                      </div>
                      <div className={styles.modalField}>
                        <label>
                          Assigned MS PIC
                          <select
                            name="ms_pic_user_id"
                            value={formState.msPicUserId}
                            onChange={handleChange('msPicUserId')}
                          >
                            <option value="">Unassigned</option>
                            {ticket.msPicOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className={styles.modalField}>
                        <label>
                          Status
                          <select name="status" value={formState.status} onChange={handleChange('status')} required>
                            {statusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                <section className={styles.modalGroup}>
                  <div className={styles.modalGroupHeader}>
                    <h4 className={styles.modalGroupTitle}>ClickUp Integration</h4>
                    <p className={styles.modalGroupDescription}>
                      Create a ClickUp task, link an existing one, or remove the current link.
                    </p>
                  </div>
                  <div className={`${styles.modalGroupBody} ${styles.clickupGroup}`}>
                    <div className={styles.clickupSummary}>
                      <div className={styles.clickupSummaryDetails}>
                        <span className={styles.clickupSummaryLabel}>Current task</span>
                        {formState.clickupLink ? (
                          <a
                            className={styles.clickupSummaryLink}
                            href={formState.clickupLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open task
                          </a>
                        ) : (
                          <span className={styles.clickupUnavailable}>No task linked</span>
                        )}
                      </div>
                      <div className={styles.clickupStatusBlock}>
                        <span className={styles.clickupSummaryLabel}>Status</span>
                        <span className={styles.clickupStatusBadge}>{clickupStatus ?? '—'}</span>
                        <button
                          type="button"
                          className={styles.clickupRefreshButton}
                          onClick={handleRefreshClickUpStatus}
                          disabled={!formState.clickupLink || !clickupEnabled || isClickUpPending}
                          title={
                            !clickupEnabled
                              ? 'ClickUp integration is not configured.'
                              : !formState.clickupLink
                                ? 'Link a ClickUp task to refresh its status.'
                                : undefined
                          }
                        >
                          {isClickUpPending && activeClickUpAction === 'refresh' ? 'Refreshing…' : 'Refresh status'}
                        </button>
                      </div>
                    </div>
                    {clickupFeedback ? (
                      <div
                        className={`${styles.modalAlert} ${
                          clickupFeedback.type === 'success' ? styles.modalAlertSuccess : styles.modalAlertError
                        }`}
                      >
                        {clickupFeedback.message}
                      </div>
                    ) : null}
                    <div className={styles.clickupActions}>
                      <div className={styles.clickupActionRow}>
                        <button
                          type="button"
                          className={`${styles.clickupActionButton} ${styles.clickupActionPrimary} ${
                            !clickupEnabled || Boolean(formState.clickupLink) ? styles.clickupActionButtonDisabled : ''
                          }`}
                          onClick={handleCreateClickUpTask}
                          disabled={!clickupEnabled || Boolean(formState.clickupLink) || isClickUpPending}
                          title={
                            !clickupEnabled
                              ? 'ClickUp integration is not configured.'
                              : formState.clickupLink
                                ? 'This ticket already has a ClickUp task.'
                                : undefined
                          }
                        >
                          {isClickUpPending && activeClickUpAction === 'create' ? 'Creating…' : 'Create ClickUp task'}
                        </button>
                        <button
                          type="button"
                          className={`${styles.clickupActionButton} ${styles.clickupActionDanger}`}
                          onClick={handleUnlinkClickUpTask}
                          disabled={!formState.clickupLink || isClickUpPending}
                        >
                          {isClickUpPending && activeClickUpAction === 'unlink' ? 'Removing…' : 'Remove link'}
                        </button>
                      </div>
                      <div className={styles.clickupLinkForm}>
                        <input
                          type="text"
                          name="clickup_link"
                          value={clickupLinkInput}
                          onChange={handleClickUpLinkInputChange}
                          onKeyDown={handleLinkInputKeyDown}
                          placeholder="Paste ClickUp link or task ID"
                          className={styles.clickupLinkInput}
                          disabled={isClickUpPending}
                        />
                        <button
                          type="button"
                          className={styles.clickupActionButton}
                          onClick={handleLinkClickUpTask}
                          disabled={!clickupLinkInput.trim() || isClickUpPending}
                        >
                          {isClickUpPending && activeClickUpAction === 'link' ? 'Linking…' : 'Link existing task'}
                        </button>
                      </div>
                      {!clickupEnabled ? (
                        <p className={styles.clickupNotice}>
                          ClickUp credentials are not configured. Creating new tasks is disabled, but you can still link an
                          existing task manually.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className={styles.modalGroup}>
                  <div className={styles.modalGroupHeader}>
                    <h4 className={styles.modalGroupTitle}>Issue Details</h4>
                    <p className={styles.modalGroupDescription}>
                      Summarise what happened and provide supporting context.
                    </p>
                  </div>
                  <div className={styles.modalGroupBody}>
                    <div className={styles.modalGrid}>
                      <div className={styles.modalField}>
                        <label>
                          Category
                          <select
                            name="issue_type"
                            value={formState.issueType}
                            onChange={handleCategorySelect}
                            required
                          >
                            <option value="" disabled>
                              Select a category
                            </option>
                            {categoryOptions.map((option) => (
                              <option key={option.category} value={option.category}>
                                {option.category}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className={styles.modalField}>
                        <label>
                          Subcategory 1
                          <select
                            name="issue_subcategory1"
                            value={formState.issueSubcategory1}
                            onChange={handleSubcategory1Select}
                            required
                            disabled={subcategory1Options.length === 0}
                          >
                            <option value="" disabled>
                              Select subcategory 1
                            </option>
                            {subcategory1Options.map((sub) => (
                              <option key={sub.name} value={sub.name}>
                                {sub.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {subcategory2Options.length > 0 ? (
                        <div className={styles.modalField}>
                          <label>
                            Subcategory 2
                            <select
                              name="issue_subcategory2"
                              value={formState.issueSubcategory2}
                              onChange={handleChange('issueSubcategory2')}
                            >
                              <option value="">Select subcategory 2 (optional)</option>
                              {subcategory2Options.map((sub2) => (
                                <option key={sub2} value={sub2}>
                                  {sub2}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : (
                        <input type="hidden" name="issue_subcategory2" value="" />
                      )}
                      <div className={`${styles.modalField} ${styles.modalFieldFull}`}>
                        <label>
                          Issue Description
                          <textarea
                            name="issue_description"
                            value={formState.issueDescription}
                            onChange={handleChange('issueDescription')}
                            required
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                <section className={styles.modalGroup}>
                  <div className={styles.modalGroupHeader}>
                    <h4 className={styles.modalGroupTitle}>Internal Notes</h4>
                    <p className={styles.modalGroupDescription}>Optional notes for the Merchant Success team.</p>
                  </div>
                  <div className={styles.modalGroupBody}>
                    <div className={styles.modalGrid}>
                      <div className={`${styles.modalField} ${styles.modalFieldFull}`}>
                        <label>
                          Ticket Notes
                          <textarea
                            name="ticket_description"
                            value={formState.ticketDescription}
                            onChange={handleChange('ticketDescription')}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                <div className={styles.modalFooter}>
                  <div className={styles.modalFooterActions}>
                    {canHideTicket && onHideTicket ? (
                      <button
                        type="button"
                        className={`${styles.modalCancel} ${styles.modalDangerGhost}`}
                        onClick={handleHideTicket}
                        disabled={isPending || isClickUpPending}
                        title={ticket.hidden ? 'Unarchive ticket' : 'Archive ticket'}
                      >
                        {ticket.hidden ? 'Unarchive Ticket' : 'Archive Ticket'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`${styles.modalCancel} ${styles.modalDangerGhost}`}
                      onClick={openHistory}
                      disabled={isPending || isClickUpPending}
                    >
                      Ticket History
                    </button>
                  </div>
                  <div className={styles.modalFooterActions}>
                    <button
                      type="button"
                      className={styles.modalCancel}
                      onClick={closeModal}
                      disabled={isPending || isClickUpPending}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={styles.modalSave} disabled={isPending || isClickUpPending}>
                      {isPending ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      {errorDialog ? (
        <div className={styles.dialogOverlay} role="alertdialog" aria-modal="true">
          <div className={styles.dialogCard}>
            <div className={styles.dialogHeader}>
              <h3>Unable to save</h3>
              <button
                type="button"
                className={styles.dialogClose}
                onClick={() => setErrorDialog(null)}
                aria-label="Close error dialog"
              >
                ×
              </button>
            </div>
            <p className={styles.dialogBody}>{errorDialog}</p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.dialogPrimary} onClick={() => setErrorDialog(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {historyOpen ? (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true">
          <div className={styles.dialogCard}>
            <div className={styles.dialogHeader}>
              <h3>Ticket History</h3>
              <button
                type="button"
                className={styles.dialogClose}
                onClick={() => setHistoryOpen(false)}
                aria-label="Close history"
              >
                ×
              </button>
            </div>
            <div className={styles.historyBody}>
              {historyLoading ? (
                <p className={styles.dialogBody}>Loading history…</p>
              ) : historyEntries.length === 0 ? (
                <p className={styles.dialogBody}>No history available.</p>
              ) : (
                <ul className={styles.historyList}>
                  {historyEntries.map((entry) => (
                    <li key={entry.changed_at + entry.field_name} className={styles.historyItem}>
                      <div className={styles.historyLine}>
                        <span className={styles.historyField}>{formatHistoryField(entry.field_name)}</span>
                        <span className={styles.historyWhen}>
                          {new Date(entry.changed_at).toLocaleString('en-MY', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: timezone,
                          })}
                        </span>
                      </div>
                      <div className={styles.historyValues}>
                        <span className={styles.historyLabel}>From:</span>
                        <span className={styles.historyValue}>
                          {formatHistoryValue(entry.field_name, entry.old_value, userDisplayById)}
                        </span>
                        <span className={styles.historyLabel}>To:</span>
                        <span className={styles.historyValue}>
                          {formatHistoryValue(entry.field_name, entry.new_value, userDisplayById)}
                        </span>
                      </div>
                      <div className={styles.historyBy}>
                        Changed by: {formatHistoryUser(entry.changed_by, userDisplayById)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.dialogPrimary} onClick={() => setHistoryOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
