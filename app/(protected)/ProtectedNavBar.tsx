'use client';

import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlignJustify, BarChart3, LayoutDashboard, ListCollapse, Sliders, Store, Ticket, User, Users } from 'lucide-react';
import styles from './layout.module.css';
import { getPortalLabel, canAccessSupportPages, canManageSupportSettings } from '@/lib/branding';

interface ProtectedNavBarProps {
  username: string;
  role: string | null;
  canManageUsers: boolean;
  department: string | null;
  isSuperAdmin: boolean;
}

type NavIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

interface NavLink {
  href: string;
  label: string;
  icon: NavIcon;
}

export default function ProtectedNavBar({
  username,
  role,
  canManageUsers,
  department,
  isSuperAdmin,
}: ProtectedNavBarProps) {
  const pathname = usePathname() || '';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('sims-nav-collapsed');
    if (stored === 'true') {
      setIsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const toggleNav = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem('sims-nav-collapsed', String(next));
      return next;
    });
  };
  const toggleMobileNav = () => {
    setIsMobileOpen((prev) => !prev);
  };
  const canSeeSupport = canAccessSupportPages(department, isSuperAdmin);
  const canConfigureSupport = canManageSupportSettings(department, role, isSuperAdmin);
  const portalLabel = getPortalLabel(department, isSuperAdmin);
  const merchantSuccessLinks: NavLink[] = canSeeSupport
    ? [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/tickets', label: 'Tickets', icon: Ticket },
        { href: '/csat', label: 'CSAT', icon: BarChart3 },
        ...(canConfigureSupport ? [{ href: '/support-settings', label: 'Support Settings', icon: Sliders }] : []),
      ]
    : [];
  const generalLinks: NavLink[] = canSeeSupport ? [{ href: '/merchants', label: 'Merchants', icon: Store }] : [];
  const settingsLinks: NavLink[] = [{ href: '/profile', label: 'Profile', icon: User }];
  if (canManageUsers) {
    settingsLinks.unshift({ href: '/users', label: 'Users', icon: Users });
  }
  const sections = [
    { title: 'Merchant Success', links: merchantSuccessLinks },
    { title: 'General', links: generalLinks },
    { title: 'Settings', links: settingsLinks },
  ].filter((section) => section.links.length > 0);
  const userMeta = role;

  return (
    <>
      <div className={styles.mobileTopNav}>
        <button
          type="button"
          className={styles.mobileTopNavButton}
          onClick={toggleMobileNav}
          aria-controls="primary-navigation"
          aria-expanded={isMobileOpen}
          aria-label={isMobileOpen ? 'Close navigation' : 'Open navigation'}
        >
          {isMobileOpen ? (
            <ListCollapse className={styles.collapseIcon} aria-hidden />
          ) : (
            <AlignJustify className={styles.collapseIcon} aria-hidden />
          )}
        </button>
        <div className={styles.mobileTopNavBrand}>
          <div className={styles.mobileTopNavLogo} aria-hidden="true">
            <Image src="/assets/system-logo-v2.png" alt="Slurp SIMS logo" width={32} height={32} priority />
          </div>
          <div className={styles.mobileTopNavText}>
            <span className={styles.mobileTopNavTitle}>SIMS</span>
            <span className={styles.mobileTopNavSubtitle}>{portalLabel}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        className={`${styles.mobileOverlay} ${isMobileOpen ? styles.mobileOverlayVisible : ''}`}
        onClick={() => setIsMobileOpen(false)}
        aria-label="Close navigation"
        aria-hidden={!isMobileOpen}
        tabIndex={isMobileOpen ? 0 : -1}
      />
      <nav
        id="primary-navigation"
        className={`${styles.nav} ${isCollapsed ? styles.navCollapsed : ''} ${
          isMobileOpen ? styles.navMobileOpen : ''
        }`}
      >
        <div className={styles.navInner}>
          <div className={styles.navHeader}>
            <div className={styles.headerTop}>
              <button
                type="button"
                className={styles.collapseButton}
                onClick={toggleNav}
                aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                aria-pressed={isCollapsed}
                title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                {isCollapsed ? (
                  <ListCollapse className={styles.collapseIcon} aria-hidden />
                ) : (
                  <AlignJustify className={styles.collapseIcon} aria-hidden />
                )}
              </button>
              <div className={styles.brand}>
                <div className={styles.brandIcon} aria-hidden="true">
                  <Image src="/assets/system-logo-v2.png" alt="Slurp SIMS logo" width={50} height={50} priority />
                </div>
                <div className={styles.brandName}>
                  <strong>SIMS</strong>
                  <span>{portalLabel}</span>
                </div>
              </div>
            </div>
            <div className={styles.userCard}>
              <div className={styles.userMeta}>
                <span className={styles.userName}>{username}</span>
                {userMeta ? <span className={styles.userRole}>{userMeta}</span> : null}
              </div>
            </div>
          </div>
          <div className={styles.navSections}>
            {sections.map((section) => (
              <div key={section.title} className={styles.section}>
                <span className={styles.sectionTitle}>{section.title}</span>
                <ul className={styles.sectionList}>
                  {section.links.map((link) => {
                    const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                    const Icon = link.icon;
                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className={`${styles.sectionLink} ${active ? styles.sectionLinkActive : ''}`}
                          aria-current={active ? 'page' : undefined}
                          aria-label={link.label}
                          title={link.label}
                          onClick={() => setIsMobileOpen(false)}
                        >
                          <Icon className={styles.sectionLinkIcon} aria-hidden />
                          <span className={styles.sectionLinkLabel}>{link.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <div className={styles.navFooter}>
            <Link
              href="/logout"
              prefetch={false}
              className={styles.logoutButton}
            >
              Log out
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}
