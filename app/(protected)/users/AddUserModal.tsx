'use client';

import { useId, useState } from 'react';
import styles from './users.module.css';

interface AddUserModalProps {
  onCreate: (formData: FormData) => Promise<void>;
  ctaLabel: string;
  modalTitle: string;
  modalSubtitle: string;
  departmentOptions: readonly string[];
  roleOptions: readonly string[];
  adminRoleOptions: readonly string[];
  isSuperAdmin: boolean;
  fixedDepartment: string | null;
}

export default function AddUserModal({
  onCreate,
  ctaLabel,
  modalTitle,
  modalSubtitle,
  departmentOptions,
  roleOptions,
  adminRoleOptions,
  isSuperAdmin,
  fixedDepartment,
}: AddUserModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const idPrefix = useId();
  const nameId = `${idPrefix}-name`;
  const emailId = `${idPrefix}-email`;
  const departmentId = `${idPrefix}-department`;
  const roleId = `${idPrefix}-role`;
  const passwordId = `${idPrefix}-password`;

  return (
    <>
      <button type="button" className={styles.heroActionButton} onClick={() => setIsOpen(true)}>
        {ctaLabel}
      </button>
      {isOpen ? (
        <div className={styles.userModalBackdrop} role="presentation">
          <div className={styles.userModal} role="dialog" aria-modal="true" aria-labelledby="add-user">
            <div className={styles.userModalHeader}>
              <div>
                <p className={styles.userModalKicker}>New User</p>
                <h3 id="add-user" className={styles.userModalTitle}>
                  {modalTitle}
                </h3>
                <p className={styles.userModalMeta}>{modalSubtitle}</p>
              </div>
              <button type="button" className={styles.userModalClose} aria-label="Close" onClick={() => setIsOpen(false)}>
                ×
              </button>
            </div>
            <div className={styles.userModalBody}>
              <form
                action={async (formData) => {
                  await onCreate(formData);
                  setIsOpen(false);
                }}
                className={styles.userModalForm}
              >
                <div className={styles.fieldGroup}>
                  <label htmlFor={nameId}>Name</label>
                  <input id={nameId} name="name" placeholder="Jane Doe" />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor={emailId}>Email</label>
                  <input id={emailId} name="email" type="email" placeholder="jane.doe@getslurp.com" required />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor={departmentId}>Department</label>
                  {isSuperAdmin ? (
                    <select id={departmentId} name="department" defaultValue="" required>
                      <option value="" disabled>
                        Select department
                      </option>
                      {departmentOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input id={departmentId} value={fixedDepartment ?? 'Not assigned'} disabled />
                      <input type="hidden" name="department" value={fixedDepartment ?? ''} />
                    </>
                  )}
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor={roleId}>Role</label>
                  <select
                    id={roleId}
                    name="role"
                    defaultValue={isSuperAdmin ? '' : adminRoleOptions[0] ?? 'Admin'}
                    required
                  >
                    {isSuperAdmin ? (
                      <option value="" disabled>
                        Select role
                      </option>
                    ) : null}
                    {(isSuperAdmin ? roleOptions : adminRoleOptions).map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor={passwordId}>Password</label>
                  <input
                    id={passwordId}
                    name="password"
                    type="password"
                    placeholder="Set a secure password"
                    required
                  />
                </div>
                <div className={styles.userModalActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setIsOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.primaryButton}>
                    Create user
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
