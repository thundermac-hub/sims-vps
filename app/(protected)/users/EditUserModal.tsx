'use client';

import { useState } from 'react';
import styles from './users.module.css';
import type { ManagedUser } from '@/lib/users';

interface EditUserModalProps {
  user: ManagedUser;
  timezone: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  deleteDisabled: boolean;
  departmentOptions: readonly string[];
  roleOptions: readonly string[];
  adminRoleOptions: readonly string[];
  isSuperAdmin: boolean;
  fixedDepartment: string | null;
  currentUserId: number | null;
}

export default function EditUserModal({
  user,
  timezone,
  updateAction,
  deleteAction,
  deleteDisabled,
  departmentOptions,
  roleOptions,
  adminRoleOptions,
  isSuperAdmin,
  fixedDepartment,
  currentUserId,
}: EditUserModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSelf = currentUserId != null && currentUserId === user.id;
  const createdDisplay = user.created_at
    ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(
        new Date(user.created_at),
      )
    : '—';

  return (
    <>
      <button type="button" className={styles.editButton} onClick={() => setIsOpen(true)}>
        Edit
      </button>
      {isOpen ? (
        <div className={styles.userModalBackdrop} role="presentation">
          <div className={styles.userModal} role="dialog" aria-modal="true" aria-labelledby={`edit-user-${user.id}`}>
            <div className={styles.userModalHeader}>
              <div>
                <p className={styles.userModalKicker}>Edit User</p>
                <h3 id={`edit-user-${user.id}`} className={styles.userModalTitle}>
                  {user.name ?? user.email}
                </h3>
                <p className={styles.userModalMeta}>
                  Created {createdDisplay} · ID #{user.id}
                </p>
              </div>
              <button type="button" className={styles.userModalClose} aria-label="Close" onClick={() => setIsOpen(false)}>
                ×
              </button>
            </div>
            <div className={styles.userModalBody}>
              <form
                action={async (formData) => {
                  try {
                    await updateAction(formData);
                    setIsOpen(false);
                  } catch (error) {
                    console.error('Failed to update user', error);
                  }
                }}
                className={styles.userModalForm}
              >
                <input type="hidden" name="id" value={user.id} />
                <label className={styles.fieldGroup}>
                  <span>Name</span>
                  <input name="name" defaultValue={user.name ?? ''} placeholder="Full name" />
                </label>
                <label className={styles.fieldGroup}>
                  <span>Email</span>
                  <input name="email" type="email" defaultValue={user.email} required />
                </label>
                <label className={styles.fieldGroup}>
                  <span>Department</span>
                  {isSuperAdmin ? (
                    <select name="department" defaultValue={user.department ?? ''} required>
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
                      <input value={user.department ?? fixedDepartment ?? 'Not assigned'} disabled />
                      <input type="hidden" name="department" value={user.department ?? fixedDepartment ?? ''} />
                    </>
                  )}
                </label>
                <label className={styles.fieldGroup}>
                  <span>Role</span>
                  {isSuperAdmin ? (
                    <select name="role" defaultValue={user.role ?? ''} required>
                      <option value="" disabled>
                        Select role
                      </option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : isSelf ? (
                    <>
                      <input value={user.role ?? 'Admin'} disabled />
                      <input type="hidden" name="role" value={user.role ?? 'Admin'} />
                    </>
                  ) : (
                    <select name="role" defaultValue={user.role ?? adminRoleOptions[0]} required>
                      {adminRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className={styles.fieldGroup}>
                  <span>New password</span>
                  <input name="password" type="password" placeholder="Leave blank to keep current password" />
                </label>
                <div className={styles.userModalActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setIsOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.primaryButton}>
                    Save changes
                  </button>
                </div>
              </form>
              <form action={deleteAction} className={styles.userModalDanger}>
                <input type="hidden" name="id" value={user.id} />
                <div>
                  <p className={styles.userModalDangerTitle}>Delete this user</p>
                  <p className={styles.userModalDangerCopy}>This action cannot be undone.</p>
                </div>
                <button type="submit" className={styles.dangerButton} disabled={deleteDisabled}>
                  {deleteDisabled ? 'Cannot delete self' : 'Delete user'}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
