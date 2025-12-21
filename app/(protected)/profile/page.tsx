import { cookies as getCookies } from 'next/headers';
import styles from './profile.module.css';
import { env } from '@/lib/env';
import { USER_COOKIE } from '@/lib/session';
import ChangePasswordForm from './ChangePasswordForm';
import { changePasswordAction } from './actions';
import { loadProfileUser } from './profile-utils';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const cookieStore = await getCookies();
  const rawIdentifier = cookieStore.get(USER_COOKIE)?.value;
  const userRecord = await loadProfileUser(rawIdentifier);

  const displayName =
    userRecord?.name?.trim()?.length ? userRecord.name.trim() : userRecord?.email ?? env.adminUser;
  const email = userRecord?.email ?? (rawIdentifier && rawIdentifier !== 'env-admin' ? rawIdentifier : env.adminUser);
  const role = userRecord?.role ?? '—';
  const department = userRecord?.department ?? '—';
  const canChangePassword = Boolean(userRecord?.id);
  const passwordDisabledMessage = canChangePassword
    ? null
    : 'Password changes require a managed user account stored in the SIMS database.';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden="true">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Account Profile</h1>
          <p className={styles.subtitle}>
            Review your account information and keep your password up to date to maintain secure access to SIMS tools.
          </p>
        </div>
      </header>

      <section className={styles.details}>
        <article className={styles.detailCard}>
          <p className={styles.detailLabel}>Name</p>
          <p className={styles.detailValue}>{displayName}</p>
        </article>
        <article className={styles.detailCard}>
          <p className={styles.detailLabel}>Email</p>
          <p className={styles.detailValue}>{email}</p>
        </article>
        <article className={styles.detailCard}>
          <p className={styles.detailLabel}>Role</p>
          <p className={styles.detailValue}>{role}</p>
        </article>
        <article className={styles.detailCard}>
          <p className={styles.detailLabel}>Department</p>
          <p className={styles.detailValue}>{department}</p>
        </article>
        <article className={styles.detailCard}>
          <p className={styles.detailLabel}>Timezone</p>
          <p className={styles.detailValue}>{env.timezone}</p>
        </article>
        {userRecord?.created_at ? (
          <article className={styles.detailCard}>
            <p className={styles.detailLabel}>Account created</p>
            <p className={styles.detailValue}>
              {new Intl.DateTimeFormat('en-MY', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: env.timezone,
              }).format(new Date(userRecord.created_at))}
            </p>
          </article>
        ) : null}
      </section>

      <section className={styles.securityCard}>
        <div>
          <p className={styles.detailLabel}>Password</p>
          <p className={styles.securityCopy}>Enter your current password and choose a new one to complete the update.</p>
        </div>
        <ChangePasswordForm action={changePasswordAction} disabled={!canChangePassword} disabledMessage={passwordDisabledMessage} />
      </section>

      <p className={styles.footnote}>
        Lost access or need assistance? Reach the Admin for help with restoring your profile.
      </p>
    </div>
  );
}
