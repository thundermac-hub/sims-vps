'use client';

import type { ChangeEvent, MutableRefObject } from 'react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import styles from './supportform.module.css';
import type { IssueCategoryConfig } from '@/lib/support-settings';

interface SubmissionState {
  message: string;
  variant: 'success' | 'error' | null;
}

interface SupportFormClientProps {
  heroContact: string;
  categoryOptions: IssueCategoryConfig[];
}

function enforceNumericLength(element: HTMLInputElement, max: number) {
  element.addEventListener('input', () => {
    const digits = element.value.replace(/\D/g, '').slice(0, max);
    if (element.value !== digits) {
      element.value = digits;
    }
  });

  element.addEventListener('keydown', (event) => {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
    if (allowed.includes(event.key)) {
      return;
    }
    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
      return;
    }
    const hasSelection = element.selectionStart !== element.selectionEnd;
    if (!hasSelection && element.value.length >= max) {
      event.preventDefault();
    }
  });

  element.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData || (window as any).clipboardData).getData('text') || '';
    const digits = text.replace(/\D/g, '');
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    const before = element.value.slice(0, start);
    const after = element.value.slice(end);
    const merged = (before + digits + after).replace(/\D/g, '').slice(0, max);
    element.value = merged;
    const pos = Math.min(before.length + digits.length, max);
    if (element.setSelectionRange) {
      element.setSelectionRange(pos, pos);
    }
    element.dispatchEvent(new Event('input'));
  });
}

const attachmentFields = ['attachment', 'attachment_receipt', 'attachment_other'] as const;
type AttachmentField = (typeof attachmentFields)[number];

type Language = 'en' | 'bm';

type TranslationConfig = {
  overlay: { title: string; close: string; link: string; imageAlt: string };
  hero: { kicker: string; title: string; description: string };
  language: { hint: string; toggleLabel: string };
  sections: {
    merchant: { title: string; subhead: string };
    issue: { title: string; subhead: string };
    attachments: { title: string; subhead: string };
  };
  merchantFields: {
    fidHint: string;
    fidLink: string;
    oidHint: string;
    nameLabel: string;
    namePlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    phoneHint: string;
  };
  issueFields: {
    categoryLabel: string;
    categoryPlaceholder: string;
    subcategory1Label: string;
    subcategory1Placeholder: string;
    subcategory2Label: string;
    subcategory2Placeholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
  };
  tips: { title: string; items: string[] };
  attachments: {
    supportedText: string;
    attachmentLabels: [string, string, string];
    removeFile: string;
    selectedPrefix: string;
  };
  buttons: { clear: string; submit: string; submitting: string };
  footer: string;
  messages: { success: string; missingWhatsapp: string; genericError: string };
};

const translations: Record<Language, TranslationConfig> = {
  en: {
    overlay: {
      title: 'How to find FID & OID',
      close: 'Close',
      link: 'Where can I find this?',
      imageAlt: 'Screenshot showing where to find the FID and OID.',
    },
    hero: {
      kicker: 'Merchant Success',
      title: 'Submit a Support Ticket',
      description:
        'Please fill all required information. Fields marked with * are mandatory. After submission you’ll be redirected to WhatsApp for faster follow-up.',
    },
    language: {
      hint: 'Click to change language',
      toggleLabel: 'Switch to Bahasa Melayu',
    },
    sections: {
      merchant: {
        title: 'Merchant Information',
        subhead: 'Provide outlet identifiers and contact details so we can locate you quickly.',
      },
      issue: {
        title: 'Issue Details',
        subhead: 'Describe the issue so we can reproduce and resolve it.',
      },
      attachments: {
        title: 'Supporting Documents',
        subhead: 'Upload screenshots, receipts, or any other files that help our team troubleshoot faster.',
      },
    },
    merchantFields: {
      fidHint: '4-digit merchant identifier.',
      fidLink: 'Where can I find this?',
      oidHint: '1–2 digit outlet identifier.',
      nameLabel: 'Full Name*',
      namePlaceholder: 'Enter your full name',
      phoneLabel: 'Contact Number*',
      phonePlaceholder: '60123456789',
      phoneHint: 'Include country code. Numbers only.',
    },
    issueFields: {
      categoryLabel: 'Category*',
      categoryPlaceholder: 'Select a category',
      subcategory1Label: 'Subcategory 1*',
      subcategory1Placeholder: 'Select a subcategory',
      subcategory2Label: 'Subcategory 2 (optional)',
      subcategory2Placeholder: 'Select a subcategory (optional)',
      descriptionLabel: 'Describe the issue*',
      descriptionPlaceholder:
        'Include steps to reproduce, error messages, payment IDs, affected devices, etc.',
    },
    tips: {
      title: 'Tips for faster resolution',
      items: [
        'Provide transaction IDs when reporting payment issues.',
        'Attach clear screenshots of error messages or hardware screens.',
        'Mention the affected outlet, POS device, and the exact time of the issue.',
      ],
    },
    attachments: {
      supportedText: 'Supported file types: JPEG, PNG, HEIC, PDF. Max size 3 MB per file.',
      attachmentLabels: ['Attachment 1 (optional)', 'Attachment 2 (optional)', 'Attachment 3 (optional)'],
      removeFile: 'Remove file',
      selectedPrefix: 'Selected:',
    },
    buttons: {
      clear: 'Clear form',
      submit: 'Submit Ticket',
      submitting: 'Submitting...',
    },
    footer:
      'After submitting, you’ll be redirected to our Merchant Success WhatsApp channel. Keep WhatsApp open to continue the conversation.',
    messages: {
      success: 'Submission saved. Redirecting to WhatsApp...',
      missingWhatsapp: 'Missing WhatsApp redirect URL',
      genericError: 'Something went wrong',
    },
  },
  bm: {
    overlay: {
      title: 'Cara mencari FID & OID',
      close: 'Tutup',
      link: 'Di mana saya boleh jumpa ini?',
      imageAlt: 'Imej panduan yang menunjukkan lokasi FID dan OID.',
    },
    hero: {
      kicker: 'Merchant Success',
      title: 'Hantar Tiket Sokongan',
      description:
        'Sila isi semua maklumat yang diperlukan. Ruangan yang ditandakan dengan * adalah wajib. Selepas penghantaran, anda akan dibawakan ke WhatsApp untuk tindakan susulan yang lebih pantas.',
    },
    language: {
      hint: 'Klik untuk tukar bahasa',
      toggleLabel: 'Tukar ke Bahasa Inggeris',
    },
    sections: {
      merchant: {
        title: 'Maklumat Peniaga',
        subhead: 'Isi ID outlet dan butiran hubungan supaya kami boleh menemui anda dengan cepat.',
      },
      issue: {
        title: 'Butiran Isu',
        subhead: 'Terangkan isu supaya kami boleh menirunya dan menyelesaikannya.',
      },
      attachments: {
        title: 'Dokumen Sokongan',
        subhead:
          'Muat naik tangkapan skrin, resit atau mana-mana fail lain yang membantu kami menyelesaikan isu dengan pantas.',
      },
    },
    merchantFields: {
      fidHint: 'Pengenal pedagang 4 digit.',
      fidLink: 'Di mana saya boleh jumpa ini?',
      oidHint: 'Pengenal outlet 1–2 digit.',
      nameLabel: 'Nama Penuh*',
      namePlaceholder: 'Masukkan nama penuh anda',
      phoneLabel: 'Nombor Telefon*',
      phonePlaceholder: '60123456789',
      phoneHint: 'Sertakan kod negara. Nombor sahaja.',
    },
    issueFields: {
      categoryLabel: 'Kategori*',
      categoryPlaceholder: 'Pilih kategori',
      subcategory1Label: 'Subkategori 1*',
      subcategory1Placeholder: 'Pilih subkategori',
      subcategory2Label: 'Subkategori 2 (pilihan)',
      subcategory2Placeholder: 'Pilih subkategori (pilihan)',
      descriptionLabel: 'Terangkan isu*',
      descriptionPlaceholder:
        'Sertakan langkah mengulangi isu, mesej ralat, ID pembayaran, peranti terjejas dan sebagainya.',
    },
    tips: {
      title: 'Petua untuk penyelesaian lebih pantas',
      items: [
        'Berikan ID transaksi apabila melaporkan isu pembayaran.',
        'Lampirkan tangkapan skrin jelas bagi mesej ralat atau paparan perkakasan.',
        'Nyatakan outlet terjejas, peranti POS dan masa tepat isu berlaku.',
      ],
    },
    attachments: {
      supportedText: 'Jenis fail disokong: JPEG, PNG, HEIC, PDF. Saiz maksimum 3 MB bagi setiap fail.',
      attachmentLabels: ['Lampiran 1 (pilihan)', 'Lampiran 2 (pilihan)', 'Lampiran 3 (pilihan)'],
      removeFile: 'Buang fail',
      selectedPrefix: 'Dipilih:',
    },
    buttons: {
      clear: 'Padam borang',
      submit: 'Hantar Tiket',
      submitting: 'Menghantar...',
    },
    footer:
      'Selepas dihantar, anda akan diarahkan ke saluran WhatsApp Merchant Success kami. Pastikan WhatsApp dibuka untuk meneruskan perbualan.',
    messages: {
      success: 'Permintaan diterima. Mengalihkan ke WhatsApp...',
      missingWhatsapp: 'URL WhatsApp tiada',
      genericError: 'Ada masalah berlaku',
    },
  },
};

const LANGUAGE_CODES = {
  en: 'EN',
  bm: 'BM',
} as const;

export default function SupportFormClient({ heroContact, categoryOptions }: SupportFormClientProps) {
  const [openHelp, setOpenHelp] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({ message: '', variant: null });
  const [pending, setPending] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory1, setSelectedSubcategory1] = useState('');
  const [selectedSubcategory2, setSelectedSubcategory2] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [attachmentSelections, setAttachmentSelections] = useState<Record<AttachmentField, string>>({
    attachment: '',
    attachment_receipt: '',
    attachment_other: '',
  });
  const attachmentRefs: Record<AttachmentField, MutableRefObject<HTMLInputElement | null>> = {
    attachment: useRef(null),
    attachment_receipt: useRef(null),
    attachment_other: useRef(null),
  };

  useEffect(() => {
    const fid = document.getElementById('fid');
    const oid = document.getElementById('oid');
    const phone = document.getElementById('phone_number');
    if (fid instanceof HTMLInputElement) {
      enforceNumericLength(fid, 4);
    }
    if (oid instanceof HTMLInputElement) {
      enforceNumericLength(oid, 2);
    }
    if (phone instanceof HTMLInputElement) {
      enforceNumericLength(phone, 15);
    }
  }, []);

  const t = translations[language];
  const heroContactLine = useMemo(() => heroContact, [heroContact]);
  const availableCategories = useMemo(() => categoryOptions, [categoryOptions]);
  const attachmentAcceptTypes = 'image/jpeg,image/png,image/heic,application/pdf';
  const supportedAttachmentText = t.attachments.supportedText;
  const attachmentLabels = t.attachments.attachmentLabels;
  const subcategory1Options = useMemo(() => {
    const match = availableCategories.find((option) => option.category === selectedCategory);
    return match?.subcategories ?? [];
  }, [availableCategories, selectedCategory]);
  const subcategory2Options = useMemo(() => {
    const match = subcategory1Options.find((option) => option.name === selectedSubcategory1);
    return match?.subcategories ?? [];
  }, [subcategory1Options, selectedSubcategory1]);

  const handleCategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setSelectedCategory(value);
    setSelectedSubcategory1('');
    setSelectedSubcategory2('');
  };

  const handleSubcategory1Change = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setSelectedSubcategory1(value);
    setSelectedSubcategory2('');
  };

  const handleSubcategory2Change = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedSubcategory2(event.target.value);
  };

  const handleAttachmentChange = (field: AttachmentField, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAttachmentSelections((prev) => ({
      ...prev,
      [field]: file?.name ?? '',
    }));
  };

  const handleAttachmentClear = (field: AttachmentField) => {
    const fieldRef = attachmentRefs[field];
    if (fieldRef.current) {
      fieldRef.current.value = '';
    }
    setAttachmentSelections((prev) => ({
      ...prev,
      [field]: '',
    }));
  };

  const handleLanguageToggle = () => {
    setLanguage((prev) => (prev === 'en' ? 'bm' : 'en'));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setPending(true);
    setSubmission({ message: '', variant: null });

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        body: formData,
      });
      const raw = await response.text();
      let data: Record<string, unknown> | null = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = null;
        }
      }
      if (!response.ok) {
        if (Array.isArray(data?.errors)) {
          throw new Error(data.errors.join(', '));
        }
        if (typeof data?.error === 'string' && data.error.trim().length > 0) {
          throw new Error(data.error);
        }
        const fallbackMessage = raw.trim() || 'Submission failed';
        throw new Error(fallbackMessage);
      }
      if (!data || typeof data !== 'object') {
        throw new Error('Unexpected server response');
      }

      setSubmission({ message: t.messages.success, variant: 'success' });
      setTimeout(() => {
        const url = typeof data?.whatsappUrl === 'string' ? data.whatsappUrl : null;
        if (url) {
          window.location.href = url;
        } else {
          setSubmission({ message: t.messages.missingWhatsapp, variant: 'error' });
        }
      }, 500);
    } catch (error) {
      const fallback = t.messages.genericError;
      const message = error instanceof Error ? error.message : fallback;
      setSubmission({ message, variant: 'error' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.overlay} ${openHelp ? styles.overlayOpen : ''}`}>
        <div className={styles.overlayCard}>
          <div className={styles.overlayHeader}>
            <strong>{t.overlay.title}</strong>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setOpenHelp(false)}>
              {t.overlay.close}
            </button>
          </div>
          <div className={styles.overlayBody}>
            <img
              src="/assets/fid-oid-help.png"
              alt={t.overlay.imageAlt}
              style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </div>
        </div>
      </div>

      <div className={styles.shell}>
        <div className={styles.formCard}>
          <header className={styles.hero}>
            <div className={styles.heroHeader}>
              <div className={styles.heroBody}>
                <div className={styles.heroIcon} aria-hidden="true">
                  💬
                </div>
                <div>
                  <p className={styles.heroKicker}>{t.hero.kicker}</p>
                  <h1 className={styles.heroTitle}>{t.hero.title}</h1>
                  <p className={styles.heroDescription}>{t.hero.description}</p>
                  <p className={styles.heroContact}>{heroContactLine}</p>
                </div>
              </div>
              <div className={styles.languageSwitcher}>
                <span className={styles.languageHint}>{t.language.hint}</span>
                <button
                  type="button"
                  className={styles.languageButton}
                  onClick={handleLanguageToggle}
                  aria-label={t.language.toggleLabel}
                  title={t.language.toggleLabel}
                >
                  <span className={styles.languageButtonIcon} aria-hidden="true">
                    🌐
                  </span>
                  <span className={styles.languageButtonText}>
                    <span
                      className={`${styles.languageOption} ${language === 'en' ? styles.languageOptionActive : ''}`}
                    >
                      {LANGUAGE_CODES.en}
                    </span>
                    <span className={styles.languageDivider}>|</span>
                    <span
                      className={`${styles.languageOption} ${language === 'bm' ? styles.languageOptionActive : ''}`}
                    >
                      {LANGUAGE_CODES.bm}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </header>

          <div className={styles.content}>
            <form id="support-form" className={styles.form} onSubmit={handleSubmit}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionNumber}>1</span>
                  <div>
                    <h3 className={styles.sectionTitle}>{t.sections.merchant.title}</h3>
                    <p className={styles.sectionSubhead}>{t.sections.merchant.subhead}</p>
                  </div>
                </div>
                <div className={styles.sectionBody}>
                  <div className={styles.grid}>
                    <div className={styles.fieldGroup}>
                      <div className={styles.labelRow}>
                        <label htmlFor="fid">FID*</label>
                        <button type="button" className={styles.inlineLink} onClick={() => setOpenHelp(true)}>
                          {t.merchantFields.fidLink}
                        </button>
                      </div>
                      <input id="fid" name="fid" required placeholder="1234" />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label htmlFor="oid">OID*</label>
                      <input id="oid" name="oid" required placeholder="12" />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label htmlFor="merchant_name">{t.merchantFields.nameLabel}</label>
                      <input
                        id="merchant_name"
                        name="merchant_name"
                        required
                        placeholder={t.merchantFields.namePlaceholder}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label htmlFor="phone_number">{t.merchantFields.phoneLabel}</label>
                      <input
                        id="phone_number"
                        name="phone_number"
                        required
                        placeholder={t.merchantFields.phonePlaceholder}
                      />
                    </div>
                    <input type="hidden" name="outlet_name" value="N/A" />
                    <input type="hidden" name="email" value="" />
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionNumber}>2</span>
                  <div>
                    <h3 className={styles.sectionTitle}>{t.sections.issue.title}</h3>
                    <p className={styles.sectionSubhead}>{t.sections.issue.subhead}</p>
                  </div>
                </div>
                <div className={styles.sectionBody}>
                  <div className={styles.grid}>
                    <div className={styles.fieldGroup}>
                      <label htmlFor="issue_type">{t.issueFields.categoryLabel}</label>
                      <select
                        id="issue_type"
                        name="issue_type"
                        required
                        value={selectedCategory}
                        onChange={handleCategoryChange}
                      >
                        <option value="" disabled>
                          {t.issueFields.categoryPlaceholder}
                        </option>
                        {availableCategories.map((option) => (
                          <option key={option.category} value={option.category}>
                            {option.category}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.fieldGroup}>
                      <label htmlFor="issue_subcategory1">{t.issueFields.subcategory1Label}</label>
                      <select
                        id="issue_subcategory1"
                        name="issue_subcategory1"
                        required
                        value={selectedSubcategory1}
                        onChange={handleSubcategory1Change}
                        disabled={subcategory1Options.length === 0}
                      >
                        <option value="" disabled>
                          {t.issueFields.subcategory1Placeholder}
                        </option>
                        {subcategory1Options.map((option) => (
                          <option key={option.name} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {subcategory2Options.length > 0 ? (
                      <div className={styles.fieldGroup}>
                        <label htmlFor="issue_subcategory2">{t.issueFields.subcategory2Label}</label>
                        <select
                          id="issue_subcategory2"
                          name="issue_subcategory2"
                          value={selectedSubcategory2}
                          onChange={handleSubcategory2Change}
                        >
                          <option value="">{t.issueFields.subcategory2Placeholder}</option>
                          {subcategory2Options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div className={`${styles.fieldGroup} ${styles.full}`}>
                      <label htmlFor="issue_description">{t.issueFields.descriptionLabel}</label>
                      <textarea
                        id="issue_description"
                        name="issue_description"
                        required
                        placeholder={t.issueFields.descriptionPlaceholder}
                      />
                    </div>
                  </div>

                  <div className={styles.tipsCard}>
                    <strong>{t.tips.title}</strong>
                    <ul>
                      {t.tips.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionNumber}>3</span>
                  <div>
                    <h3 className={styles.sectionTitle}>{t.sections.attachments.title}</h3>
                    <p className={styles.sectionSubhead}>{t.sections.attachments.subhead}</p>
                    <p className={styles.sectionSubhead}>{supportedAttachmentText}</p>
                  </div>
                </div>
                <div className={styles.sectionBody}>
                  <div className={styles.grid}>
                    <div className={`${styles.fieldGroup} ${styles.full}`}>
                      <div className={styles.labelRow}>
                        <label htmlFor="attachment">{attachmentLabels[0]}</label>
                        {attachmentSelections.attachment ? (
                          <button type="button" className={styles.inlineLink} onClick={() => handleAttachmentClear('attachment')}>
                            {t.attachments.removeFile}
                          </button>
                        ) : null}
                      </div>
                      <input
                        ref={attachmentRefs.attachment}
                        id="attachment"
                        name="attachment"
                        type="file"
                        accept={attachmentAcceptTypes}
                        onChange={(event) => handleAttachmentChange('attachment', event)}
                      />
                      {attachmentSelections.attachment ? (
                        <p className={styles.hint}>
                          {t.attachments.selectedPrefix} {attachmentSelections.attachment}
                        </p>
                      ) : null}
                    </div>
                    <div className={`${styles.fieldGroup} ${styles.full}`}>
                      <div className={styles.labelRow}>
                        <label htmlFor="attachment_receipt">{attachmentLabels[1]}</label>
                        {attachmentSelections.attachment_receipt ? (
                          <button
                            type="button"
                            className={styles.inlineLink}
                            onClick={() => handleAttachmentClear('attachment_receipt')}
                          >
                            {t.attachments.removeFile}
                          </button>
                        ) : null}
                      </div>
                      <input
                        ref={attachmentRefs.attachment_receipt}
                        id="attachment_receipt"
                        name="attachment_receipt"
                        type="file"
                        accept={attachmentAcceptTypes}
                        onChange={(event) => handleAttachmentChange('attachment_receipt', event)}
                      />
                      {attachmentSelections.attachment_receipt ? (
                        <p className={styles.hint}>
                          {t.attachments.selectedPrefix} {attachmentSelections.attachment_receipt}
                        </p>
                      ) : null}
                    </div>
                    <div className={`${styles.fieldGroup} ${styles.full}`}>
                      <div className={styles.labelRow}>
                        <label htmlFor="attachment_other">{attachmentLabels[2]}</label>
                        {attachmentSelections.attachment_other ? (
                          <button
                            type="button"
                            className={styles.inlineLink}
                            onClick={() => handleAttachmentClear('attachment_other')}
                          >
                            {t.attachments.removeFile}
                          </button>
                        ) : null}
                      </div>
                      <input
                        ref={attachmentRefs.attachment_other}
                        id="attachment_other"
                        name="attachment_other"
                        type="file"
                        accept={attachmentAcceptTypes}
                        onChange={(event) => handleAttachmentChange('attachment_other', event)}
                      />
                      {attachmentSelections.attachment_other ? (
                        <p className={styles.hint}>
                          {t.attachments.selectedPrefix} {attachmentSelections.attachment_other}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              {submission.variant ? (
                <div className={`${styles.alert} ${styles[submission.variant]}`}>
                  {submission.message}
                </div>
              ) : null}

              <div className={styles.actions}>
                <div className={styles.actionsLeft}>
                  <button type="reset" className={`${styles.btn} ${styles.btnGhost}`}>
                    {t.buttons.clear}
                  </button>
                </div>
                <button type="submit" id="submit-btn" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
                  {pending ? t.buttons.submitting : t.buttons.submit}
                </button>
              </div>
            </form>
          </div>

          <div className={styles.footer}>
            <p>{t.footer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
