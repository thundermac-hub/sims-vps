'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import styles from './support-settings.module.css';
import ticketsStyles from '../tickets/tickets.module.css';
import type { SupportFormSettings } from '@/lib/support-settings';
import { serializeCategoryOptions } from './category-matrix';
import type { SaveSettingsResult } from './actions';

export interface FormState {
  status: 'idle' | 'success' | 'error';
  message: string | null;
}

interface SupportSettingsFormProps {
  initialSettings: SupportFormSettings;
  action: (
    state: FormState | SaveSettingsResult,
    formData: FormData,
  ) => Promise<FormState | SaveSettingsResult>;
}

const INITIAL_FORM_STATE: FormState = {
  status: 'idle',
  message: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.saveButton} disabled={pending}>
      {pending ? 'Saving…' : 'Save Changes'}
    </button>
  );
}

export default function SupportSettingsForm({ initialSettings, action }: SupportSettingsFormProps) {
  const [state, formAction] = useActionState<FormState | SaveSettingsResult, FormData>(
    action,
    INITIAL_FORM_STATE,
  );
  const categoryMatrixDefault = serializeCategoryOptions(initialSettings.categoryOptions);
  const messageState =
    'status' in state && (state.status === 'success' || state.status === 'error')
      ? (state as FormState)
      : 'message' in state && 'settings' in state && state.status
        ? ({ status: state.status, message: state.message } as FormState)
        : null;

  return (
    <form action={formAction} className={styles.form}>
      <section className={`${ticketsStyles.filtersCard} ${styles.section}`}>
        <div className={styles.sectionHeaderSimple}>
          <div>
            <h3>Merchant Success Contact</h3>
            <p>These fields feed the contact banner that appears atop the public form.</p>
          </div>
        </div>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>WhatsApp / Phone Number</span>
            <input
              type="text"
              name="contactPhone"
              defaultValue={initialSettings.contactPhone ?? ''}
              placeholder="+60 11-0000 0000"
            />
          </label>
          <label className={styles.field}>
            <span>Support Email</span>
            <input
              type="email"
              name="contactEmail"
              defaultValue={initialSettings.contactEmail ?? ''}
              placeholder="support@example.com"
            />
          </label>
        </div>
      </section>

      <section className={`${ticketsStyles.filtersCard} ${styles.section}`}>
        <div className={styles.sectionHeaderSimple}>
          <div>
            <h3>Category Mapping</h3>
            <p>Define the Category → Subcategory 1 → Subcategory 2 hierarchy shown on the public form.</p>
          </div>
        </div>
        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Category Matrix</span>
          <textarea
            name="categoryMatrix"
            defaultValue={categoryMatrixDefault}
            rows={10}
            placeholder={'Hardware > Printer > Connection Issue\nHardware > Printer > Printing Issue\nHardware > Cash Drawer'}
          />
          <span className={styles.helpText}>
            Enter one combination per line using the format <code>Category &gt; Subcategory 1 &gt; Subcategory 2</code>.
            Leave the last part blank if Subcategory 2 is not needed.
          </span>
        </label>
      </section>

      {messageState && messageState.status !== 'idle' && messageState.message ? (
        <div
          className={`${styles.alert} ${
            messageState.status === 'success' ? styles.alertSuccess : styles.alertError
          }`}
        >
          {messageState.message}
        </div>
      ) : null}

      <div className={styles.actions}>
        <SubmitButton />
      </div>
    </form>
  );
}
