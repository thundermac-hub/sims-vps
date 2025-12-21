'use client';

import { useMemo, useState } from 'react';
import CsatSurveyForm from './CsatSurveyForm';
import styles from './survey.module.css';
import type { CsatScore } from '@/lib/csat-types';

type Language = 'en' | 'bm';

interface CsatSurveyContentProps {
  token: string;
  merchantName: string;
  isExpired: boolean;
  alreadySubmitted: boolean;
  inviteAvailable: boolean;
}

const translations: Record<
  Language,
  {
    subtitle: (name: string) => string;
    letter: string[];
    headerTitle: string;
    supportQuestion: string;
    supportPrompt: string;
    productQuestion: string;
    productPrompt: string;
    unavailableTitle: string;
    unavailableBody: string;
    expiredTitle: string;
    expiredBody: string;
    options: Array<{ value: CsatScore; label: string; emoji: string }>;
  }
> = {
  en: {
    subtitle: (name) =>
      `Dear ${name}, thank you for reaching out to Slurp Support. Please take a minute to tell us how the interaction went so we can keep improving.`,
    letter: [
      'Dear Valued Customer,',
      'Thank you for contacting our Slurp Support. Appreciate you to share your experience with us today.',
    ],
    headerTitle: 'We appreciate your feedback',
    supportQuestion: 'How satisfied are you with Slurp Support?',
    supportPrompt: "Please let us know the reason if you're dissatisfied:",
    productQuestion: 'How satisfied are you with the Slurp Product overall?',
    productPrompt: 'Please share how we can improve our product:',
    unavailableTitle: 'Link unavailable.',
    unavailableBody: 'This CSAT link is invalid or has been revoked. Please reach out to your Slurp Support representative.',
    expiredTitle: 'This link has expired.',
    expiredBody: 'CSAT links are valid for 3 days after a ticket is resolved. Please request a fresh link from our team.',
    options: [
      { value: 'Very Satisfied', label: 'Very Satisfied', emoji: '☺️' },
      { value: 'Satisfied', label: 'Satisfied', emoji: '😊' },
      { value: 'Neutral', label: 'Neutral', emoji: '😐' },
      { value: 'Dissatisfied', label: 'Dissatisfied', emoji: '☹️' },
    ],
  },
  bm: {
    subtitle: (name) =>
      `Pelanggan yang dihormati ${name}, terima kasih kerana menghubungi Slurp Support. Sila luangkan masa untuk berkongsi pengalaman anda supaya kami boleh terus menambah baik.`,
    letter: [
      'Pelanggan yang dihormati,',
      'Terima kasih kerana menghubungi Slurp Support kami. Menghargai anda untuk berkongsi pengalaman anda dengan kami hari ini.',
    ],
    headerTitle: 'Kami menghargai maklum balas anda',
    supportQuestion: 'Sejauh manakah anda berpuas hati dengan Slurp Support?',
    supportPrompt: 'Sila beritahu kami sebabnya jika anda tidak berpuas hati:',
    productQuestion: 'Sejauh manakah anda berpuas hati dengan Produk Slurp secara keseluruhan?',
    productPrompt: 'Sila kongsi bagaimana kami boleh menambah baik produk kami:',
    unavailableTitle: 'Pautan tidak tersedia.',
    unavailableBody:
      'Pautan CSAT ini tidak sah atau telah dibatalkan. Sila hubungi wakil Slurp Support anda.',
    expiredTitle: 'Pautan ini telah tamat tempoh.',
    expiredBody:
      'Pautan CSAT sah untuk 3 hari selepas tiket diselesaikan. Sila minta pautan baharu daripada pasukan kami.',
    options: [
      { value: 'Very Satisfied', label: 'Sangat Puas Hati', emoji: '☺️' },
      { value: 'Satisfied', label: 'Puas hati', emoji: '😊' },
      { value: 'Neutral', label: 'Berkecuali', emoji: '😐' },
      { value: 'Dissatisfied', label: 'Tidak berpuas hati', emoji: '☹️' },
    ],
  },
};

export default function CsatSurveyContent({
  token,
  merchantName,
  isExpired,
  alreadySubmitted,
  inviteAvailable,
}: CsatSurveyContentProps) {
  const [language, setLanguage] = useState<Language>('en');
  const copy = translations[language];

  const headerSubtitle = useMemo(
    () =>
      copy.subtitle(merchantName ? `<strong>${merchantName}</strong>` : '<strong>Valued Customer</strong>'),
    [copy, merchantName],
  );
  const thanksFooter =
    language === 'en'
      ? 'Thank you again for your valuable feedback.'
      : 'Terima kasih sekali lagi atas maklum balas anda yang berharga.';
  const submittedCopy =
    language === 'en'
      ? 'Thanks for submitting your CSAT. We truly appreciate your time.'
      : 'Terima kasih kerana menghantar CSAT anda. Kami sangat menghargai masa anda.';
  const submittedTitle =
    language === 'en' ? 'Thank you for your valuable feedback.' : 'Terima kasih atas maklum balas anda yang berharga.';
  const submittedBody =
    language === 'en'
      ? 'We’ve recorded your responses and the team will review them to keep improving Slurp Support and product experience.'
      : 'Kami telah merekod maklum balas anda dan pasukan akan menelitinya untuk terus menambah baik Slurp Support dan pengalaman produk.';

  return (
    <>
      <div className={styles.header}>
      <div>
        <p className={styles.eyebrow}>Customer Satisfaction Survey</p>
        <h1 className={styles.title}>{copy.headerTitle}</h1>
        <p
          className={styles.subtitle}
          dangerouslySetInnerHTML={{ __html: headerSubtitle }}
        />
      </div>
        <div className={styles.languageSwitcher}>
          <p className={styles.languageHint}>{language === 'en' ? 'Tukar ke BM' : 'Switch to EN'}</p>
          <button
            type="button"
            className={styles.languageButton}
            onClick={() => setLanguage((prev) => (prev === 'en' ? 'bm' : 'en'))}
          >
            <span className={styles.languageButtonIcon}>🌐</span>
            <span className={styles.languageButtonText}>{language === 'en' ? 'Bahasa Melayu' : 'English'}</span>
          </button>
        </div>
      </div>

      <div className={styles.letter}>
        {copy.letter.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      {!inviteAvailable ? (
        <div className={styles.invalid}>
          <strong>{copy.unavailableTitle}</strong>
          <p>{copy.unavailableBody}</p>
        </div>
      ) : isExpired ? (
        <div className={styles.invalid}>
          <strong>{copy.expiredTitle}</strong>
          <p>{copy.expiredBody}</p>
        </div>
      ) : alreadySubmitted ? (
        <div className={styles.successCard}>
          <p className={styles.successEmoji}>❤️</p>
          <h3>{submittedTitle}</h3>
          <p className={styles.successCopy}>{submittedBody}</p>
        </div>
      ) : (
        <CsatSurveyForm
          token={token}
          supportQuestion={copy.supportQuestion}
          supportPrompt={copy.supportPrompt}
          productQuestion={copy.productQuestion}
          productPrompt={copy.productPrompt}
          options={copy.options}
          successCopy={{ title: submittedTitle, body: submittedBody }}
        />
      )}

      <p className={styles.subtitle}>{thanksFooter}</p>
    </>
  );
}
