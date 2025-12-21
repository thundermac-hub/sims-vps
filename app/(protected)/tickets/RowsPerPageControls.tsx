'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import styles from './tickets.module.css';

interface RowsPerPageControlsProps {
  options: readonly number[];
  current: number;
  onChange: (formData: FormData) => void | Promise<void>;
}

export default function RowsPerPageControls({ options, current, onChange }: RowsPerPageControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSelect = (option: number) => {
    startTransition(() => {
      const formData = new FormData();
      formData.set('intent', 'instant');
      formData.set('perPage', String(option));
      void (async () => {
        try {
          await onChange(formData);
        } catch (error) {
          console.error('Failed to update rows per page', error);
        }
        router.refresh();
      })();
    });
  };

  return (
    <div className={styles.paginationPerPageOptions}>
      {options.map((option) =>
        option === current ? (
          <span key={option} className={`${styles.paginationButton} ${styles.paginationButtonActive}`}>
            {option}
          </span>
        ) : (
          <button
            key={option}
            type="button"
            onClick={() => handleSelect(option)}
            className={styles.paginationButton}
            disabled={isPending}
          >
            {option}
          </button>
        ),
      )}
    </div>
  );
}
