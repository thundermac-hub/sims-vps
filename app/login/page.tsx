import { redirect } from 'next/navigation';
import { cookies as getCookies } from 'next/headers';
import Image from 'next/image';
import { SESSION_COOKIE, isSessionValid } from '@/lib/session';
import styles from './login.module.css';
import { ErrorPopup } from './error-popup';

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await Promise.resolve(searchParams);

  const cookieStore = await getCookies();
  if (isSessionValid(cookieStore.get(SESSION_COOKIE)?.value)) {
    redirect('/dashboard');
  }

  const error = resolvedParams.error === '1';
  const redirectParam = typeof resolvedParams.redirect === 'string' ? resolvedParams.redirect : undefined;
  const redirectTarget = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard';

  return (
    <div className={styles.page}>
      <ErrorPopup open={error} message="The provided credentials do not match our records. Please try again." />
      <div className={styles.shell}>
        <div className={styles.card}>
          <header className={styles.header}>
            <div className={styles.logo} aria-hidden="true">
              <Image src="/assets/system-logo-v2.png" alt="Slurp SIMS logo" width={64} height={64} priority />
            </div>
            <div>
              <p className={styles.kicker}>SIMS Login</p>
              <h1 className={styles.title}>Sign in to access the dashboard</h1>
              <p className={styles.subtitle}>Use the credentials assigned by your respective team lead.</p>
            </div>
          </header>

          <form className={styles.form} action="/login/submit" method="POST">
            <input type="hidden" name="redirect" value={redirectTarget} />

            <div className={styles.fieldGroup}>
              <label htmlFor="username">Email</label>
              <input id="username" name="username" autoComplete="username" required placeholder="Enter your email" />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
            </div>

            <button type="submit" className={styles.submitButton}>
              Sign in
            </button>
          </form>

          <footer className={styles.footer}>
            <p>
              Made with ❤️ by <strong><em>Slurp!</em></strong>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
