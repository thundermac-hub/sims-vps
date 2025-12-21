import ticketsStyles from '../tickets/tickets.module.css';
import styles from './support-settings.module.css';
import SupportSettingsForm from './SupportSettingsForm';
import { ensureCanEditSupportSettings, loadSupportSettings, saveSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SupportSettingsPage() {
  await ensureCanEditSupportSettings();
  const settings = await loadSupportSettings();

  return (
    <div className={ticketsStyles.page}>
      <section className={ticketsStyles.hero}>
        <div className={ticketsStyles.heroTop}>
          <div>
            <h1 className={ticketsStyles.heroTitle}>Support Form Settings</h1>
            <p className={ticketsStyles.heroSubtitle}>
              Quickly adjust the contact banner plus the Category → Subcategory hierarchy shown on the public form.
              Changes take effect immediately for merchants.
            </p>
          </div>
        </div>
      </section>

      <SupportSettingsForm initialSettings={settings} action={saveSettingsAction} />
    </div>
  );
}
