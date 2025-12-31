import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import styles from '../users.module.css';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { getUserById, updateUser } from '@/lib/users';

type SearchParams = Record<string, string | string[] | undefined>;

function normaliseParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function ensureCanManageUsers() {
  const authUser = await getAuthenticatedUser();
  if (!authUser.canManageUsers) {
    redirect('/profile');
  }
  return authUser;
}

async function updateUserStatusAction(formData: FormData) {
  'use server';
  const authUser = await ensureCanManageUsers();
  const userId = Number(formData.get('id'));
  const isActiveRaw = (formData.get('is_active') ?? '').toString().trim().toLowerCase();
  const isActive = isActiveRaw === 'true' || isActiveRaw === '1' || isActiveRaw === 'yes';

  if (!Number.isFinite(userId)) {
    throw new Error('Invalid user identifier.');
  }
  if (!isActive && authUser.id === userId) {
    throw new Error('You cannot deactivate your own account.');
  }

  const targetUser = await getUserById(userId, { includeInactive: true });
  if (!targetUser) {
    throw new Error('User not found.');
  }
  if (!authUser.isSuperAdmin && targetUser.department !== authUser.department) {
    throw new Error('You cannot change access for users outside your department.');
  }

  await updateUser(userId, { isActive });
  revalidatePath('/users');
  redirect('/users');
}

export default async function ConfirmUserStatusPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const authUser = await ensureCanManageUsers();
  const resolvedParams = await Promise.resolve(searchParams ?? {});
  const idParam = normaliseParam(resolvedParams.id);
  const nextParam = normaliseParam(resolvedParams.next);
  const userId = Number(idParam);
  const targetStatus = nextParam === 'active' || nextParam === 'inactive' ? nextParam : null;

  if (!Number.isFinite(userId) || !targetStatus) {
    notFound();
  }

  const targetUser = await getUserById(userId, { includeInactive: true });
  if (!targetUser) {
    notFound();
  }
  if (!authUser.isSuperAdmin && targetUser.department !== authUser.department) {
    redirect('/users');
  }

  const isActiveTarget = targetStatus === 'active';
  const actionTitle = isActiveTarget ? 'Reactivate user access' : 'Set user as inactive';
  const actionCopy = isActiveTarget ? 'This will restore login access and assignment availability.' : null;
  const confirmLabel = isActiveTarget ? 'Reactivate User' : 'Set as Inactive';
  const statusActionDisabled = !isActiveTarget && authUser.id === targetUser.id;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.heroTitle}>{actionTitle}</h1>
            {actionCopy ? <p className={styles.heroSubtitle}>{actionCopy}</p> : null}
          </div>
          <div className={styles.heroActions}>
            <Link className={styles.heroActionButton} href="/users">
              Back to users
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.usersTableCard}>
        <div className={styles.usersTableHeader}>
          <h2>Confirm status change</h2>
          <span>{targetUser.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <div className={styles.confirmBody}>
          <p className={styles.confirmCopy}>Please confirm you want to update this user&apos;s access status.</p>
          <div className={styles.confirmGrid}>
            <div className={styles.confirmField}>
              <span className={styles.confirmLabel}>Name</span>
              <span className={styles.confirmValue}>{targetUser.name ?? '—'}</span>
            </div>
            <div className={styles.confirmField}>
              <span className={styles.confirmLabel}>Email</span>
              <span className={styles.confirmValue}>{targetUser.email}</span>
            </div>
            <div className={styles.confirmField}>
              <span className={styles.confirmLabel}>Department</span>
              <span className={styles.confirmValue}>{targetUser.department ?? '—'}</span>
            </div>
            <div className={styles.confirmField}>
              <span className={styles.confirmLabel}>Role</span>
              <span className={styles.confirmValue}>{targetUser.role ?? '—'}</span>
            </div>
            <div className={styles.confirmField}>
              <span className={styles.confirmLabel}>Current status</span>
              <span className={styles.confirmValue}>{targetUser.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className={styles.confirmField}>
              <span className={styles.confirmLabel}>Next status</span>
              <span className={styles.confirmValue}>{isActiveTarget ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
          {statusActionDisabled ? (
            <div className={styles.confirmWarning}>You cannot deactivate your own account.</div>
          ) : null}
          <div className={styles.confirmActions}>
            <Link className={`${styles.secondaryButton} ${styles.buttonLink}`} href="/users">
              Cancel
            </Link>
            <form action={updateUserStatusAction}>
              <input type="hidden" name="id" value={targetUser.id} />
              <input type="hidden" name="is_active" value={isActiveTarget ? 'true' : 'false'} />
              <button
                type="submit"
                className={isActiveTarget ? styles.primaryButton : styles.dangerButton}
                disabled={statusActionDisabled}
              >
                {confirmLabel}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
