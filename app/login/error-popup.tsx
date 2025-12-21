'use client';

import { useEffect, useState } from 'react';
import styles from './login.module.css';

interface ErrorPopupProps {
  message: string;
  open: boolean;
}

export function ErrorPopup({ message, open }: ErrorPopupProps) {
  const [isOpen, setIsOpen] = useState(open);

  useEffect(() => {
    setIsOpen(open);
  }, [open]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.errorOverlay} role="dialog" aria-modal="true" aria-labelledby="login-error-title">
      <div className={styles.errorDialog}>
        <h2 className={styles.errorTitle} id="login-error-title">
          Login failed
        </h2>
        <p className={styles.errorMessage}>{message}</p>
        <button type="button" className={styles.errorClose} onClick={() => setIsOpen(false)}>
          Close
        </button>
      </div>
    </div>
  );
}
