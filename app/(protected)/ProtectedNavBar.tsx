'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';
import { getPortalLabel, canAccessSupportPages, canManageSupportSettings } from '@/lib/branding';

interface ProtectedNavBarProps {
  username: string;
  role: string | null;
  canManageUsers: boolean;
  department: string | null;
  isSuperAdmin: boolean;
}

function deriveInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return 'MS';
  }
  const [first, second] = parts;
  const initials = `${first.charAt(0) ?? ''}${second?.charAt(0) ?? ''}`.toUpperCase();
  return initials || (name.charAt(0)?.toUpperCase() ?? 'MS');
}

export default function ProtectedNavBar({
  username,
  role,
  canManageUsers,
  department,
  isSuperAdmin,
}: ProtectedNavBarProps) {
  const pathname = usePathname() || '';
  const canSeeSupport = canAccessSupportPages(department, isSuperAdmin);
  const canConfigureSupport = canManageSupportSettings(department, role, isSuperAdmin);
  const baseLinks = canSeeSupport
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/tickets', label: 'Tickets' },
        { href: '/merchants', label: 'Merchants' },
        { href: '/csat', label: 'CSAT' },
        ...(canConfigureSupport ? [{ href: '/support-settings', label: 'Support Settings' }] : []),
      ]
    : [];
  const links = canManageUsers ? [...baseLinks, { href: '/users', label: 'Users' }] : baseLinks;
  const initials = deriveInitials(username);
  const portalLabel = getPortalLabel(department, isSuperAdmin);

  return (
    <nav className={styles.nav}>
      <div className={styles.navInner}>
        <div className={styles.navLeft}>
          <div className={styles.brand}>
            <div className={styles.brandIcon} aria-hidden="true">
              <Image src="/assets/system-logo-v2.png" alt="Slurp SIMS logo" width={42} height={42} priority />
            </div>
            <div className={styles.brandName}>
              <strong>SIMS</strong>
              <span>{portalLabel}</span>
            </div>
          </div>
          <div className={styles.links}>
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${styles.link} ${active ? styles.linkActive : ''}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className={styles.actions}>
          <Link href="/logout" prefetch={false} className={styles.logoutButton}>
            Log out
          </Link>
          <Link
            href="/profile"
            className={styles.profileButton}
            title={`${username}${role ? ` • ${role}` : ''}`}
            aria-label={`View profile for ${username}`}
          >
            <span className={styles.profileInitials}>{initials}</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
