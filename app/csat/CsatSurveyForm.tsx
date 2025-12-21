'use client';

import { FormEvent, useMemo, useState } from 'react';
import styles from './survey.module.css';
import { CSAT_SCORES, type CsatScore } from '@/lib/csat-types';

interface CsatSurveyFormProps {
  token: string;
  supportQuestion: string;
  supportPrompt: string;
  productQuestion: string;
  productPrompt: string;
  options: Array<{ value: CsatScore; label: string; emoji: string }>;
  successCopy: { title: string; body: string };
}

export default function CsatSurveyForm({
  token,
  supportQuestion,
  supportPrompt,
  productQuestion,
  productPrompt,
  options,
  successCopy,
}: CsatSurveyFormProps) {
  const [supportScore, setSupportScore] = useState<CsatScore | ''>('');
  const [productScore, setProductScore] = useState<CsatScore | ''>('');
  const [supportReason, setSupportReason] = useState('');
  const [productFeedback, setProductFeedback] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return CSAT_SCORES.includes(supportScore as CsatScore) && CSAT_SCORES.includes(productScore as CsatScore);
  }, [supportScore, productScore]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    if (!token) {
      setStatus({ type: 'error', message: 'Survey link is invalid. Please request a fresh link.' });
      return;
    }
    if (!canSubmit) {
      setStatus({ type: 'error', message: 'Please answer both questions before submitting.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/csat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          supportScore,
          supportReason,
          productScore,
          productFeedback,
        }),
      });
      const payload = (await response.json()) as { error?: string; submittedAt?: string };
      if (!response.ok) {
        setStatus({ type: 'error', message: payload.error || 'Unable to submit your feedback right now.' });
        return;
      }
      setSubmittedAt(payload.submittedAt ?? new Date().toISOString());
      setStatus({ type: 'success', message: 'Thanks for sharing your feedback!' });
    } catch (error) {
      console.error('CSAT submit error', error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to submit your feedback right now.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedAt) {
    return (
      <div className={styles.successCard}>
        <p className={styles.successEmoji}>✨</p>
        <h3>{successCopy.title}</h3>
        <p className={styles.successCopy}>{successCopy.body}</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.questionBlock}>
        <div className={styles.questionHeader}>
          <span className={styles.questionNumber}>1</span>
          <div>
            <p className={styles.questionTitle}>{supportQuestion}</p>
            <p className={styles.questionHint}>Pick the option that best describes today’s support experience.</p>
          </div>
        </div>
        <div className={styles.optionGrid}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.optionButton} ${supportScore === option.value ? styles.optionActive : ''}`}
              onClick={() => setSupportScore(option.value)}
              aria-pressed={supportScore === option.value}
            >
              <span className={styles.optionEmoji} aria-hidden="true">
                {option.emoji}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <label className={styles.textareaLabel}>
          {supportPrompt}
          <textarea
            value={supportReason}
            onChange={(event) => setSupportReason(event.target.value)}
            placeholder="Tell us what worked well or what we should improve in support."
          />
        </label>
      </div>

      <div className={styles.questionBlock}>
        <div className={styles.questionHeader}>
          <span className={styles.questionNumber}>2</span>
          <div>
            <p className={styles.questionTitle}>{productQuestion}</p>
            <p className={styles.questionHint}>Thinking beyond support, how does Slurp perform for your outlet?</p>
          </div>
        </div>
        <div className={styles.optionGrid}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.optionButton} ${productScore === option.value ? styles.optionActive : ''}`}
              onClick={() => setProductScore(option.value)}
              aria-pressed={productScore === option.value}
            >
              <span className={styles.optionEmoji} aria-hidden="true">
                {option.emoji}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <label className={styles.textareaLabel}>
          {productPrompt}
          <textarea
            value={productFeedback}
            onChange={(event) => setProductFeedback(event.target.value)}
            placeholder="Features, stability, reporting, or anything else we should focus on."
          />
        </label>
      </div>

      {status ? (
        <div className={`${styles.status} ${status.type === 'success' ? styles.statusSuccess : styles.statusError}`}>
          {status.message}
        </div>
      ) : null}

      <button type="submit" className={styles.submitButton} disabled={!canSubmit || isSubmitting}>
        {isSubmitting ? 'Submitting…' : 'Submit feedback'}
      </button>
    </form>
  );
}
