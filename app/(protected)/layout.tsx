import { ReactNode } from 'react';
import styles from './layout.module.css';
import ProtectedNavBar from './ProtectedNavBar';
import { getAuthenticatedUser } from '@/lib/auth-user';

interface ProtectedLayoutProps {
  children: ReactNode;
}

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const authUser = await getAuthenticatedUser();
  return (
    <div className={styles.wrapper}>
      <ProtectedNavBar
        username={authUser.name}
        role={authUser.role}
        canManageUsers={authUser.canManageUsers}
        department={authUser.department}
        isSuperAdmin={authUser.isSuperAdmin}
      />
      <main className={styles.content}>
        <div className={styles.contentInner}>{children}</div>
      </main>
    </div>
  );
}
