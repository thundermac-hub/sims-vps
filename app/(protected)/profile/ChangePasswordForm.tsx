'use client';

import { useActionState } from 'react';
import styles from './profile.module.css';

export type PasswordFormState = {
  status: 'idle' | 'success' | 'error';
  message: string | null;
};

const INITIAL_STATE: PasswordFormState = {
  status: 'idle',
  message: null,
};

interface ChangePasswordFormProps {
  action: (state: PasswordFormState, formData: FormData) => Promise<PasswordFormState>;
  disabled?: boolean;
  disabledMessage?: string | null;
}

export default function ChangePasswordForm({ action, disabled = false, disabledMessage = null }: ChangePasswordFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const isDisabled = disabled;

  return (
    <form className={styles.passwordForm} action={formAction}>
      <div className={styles.passwordGrid}>
        <label className={styles.fieldGroup}>
          <span>Current password</span>
          <input
            type="password"
            name="current_password"
            placeholder="Enter current password"
            required
            disabled={isDisabled}
            autoComplete="current-password"
          />
        </label>
        <label className={styles.fieldGroup}>
          <span>New password</span>
          <input
            type="password"
            name="new_password"
            placeholder="Enter new password"
            required
            disabled={isDisabled}
            autoComplete="new-password"
          />
        </label>
        <label className={styles.fieldGroup}>
          <span>Confirm new password</span>
          <input
            type="password"
            name="confirm_password"
            placeholder="Re-enter new password"
            required
            disabled={isDisabled}
            autoComplete="new-password"
          />
        </label>
      </div>
      {state.message ? (
        <p
          className={`${styles.formMessage} ${
            state.status === 'success' ? styles.formMessageSuccess : styles.formMessageError
          }`}
        >
          {state.message}
        </p>
      ) : null}
      {disabledMessage ? <p className={`${styles.formMessage} ${styles.formMessageMuted}`}>{disabledMessage}</p> : null}
      <div className={styles.securityActions}>
        <button type="submit" className={styles.primaryButton} disabled={isDisabled}>
          Change Password
        </button>
      </div>
    </form>
  );
}
