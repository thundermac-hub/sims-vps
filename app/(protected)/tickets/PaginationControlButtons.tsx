'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import styles from './tickets.module.css';

interface PaginationControlButtonsProps {
  page: number;
  totalPages: number;
  previousPage: number | null;
  nextPage: number | null;
  onChange: (formData: FormData) => void | Promise<void>;
}

export default function PaginationControlButtons({
  page,
  totalPages,
  previousPage,
  nextPage,
  onChange,
}: PaginationControlButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const goToPage = (target: number) => {
    startTransition(() => {
      const formData = new FormData();
      formData.set('intent', 'instant');
      formData.set('page', String(target));
      void (async () => {
        try {
          await onChange(formData);
        } catch (error) {
          console.error('Failed to update page', error);
        }
        router.refresh();
      })();
    });
  };

  return (
    <div className={styles.paginationControls}>
      {previousPage ? (
        <button
          type="button"
          className={styles.paginationButton}
          onClick={() => goToPage(previousPage)}
          disabled={isPending}
        >
          Previous
        </button>
      ) : (
        <span className={`${styles.paginationButton} ${styles.paginationButtonDisabled}`}>Previous</span>
      )}
      <span className={styles.paginationPageIndicator}>
        Page {page} of {totalPages}
      </span>
      {nextPage ? (
        <button
          type="button"
          className={styles.paginationButton}
          onClick={() => goToPage(nextPage)}
          disabled={isPending}
        >
          Next
        </button>
      ) : (
        <span className={`${styles.paginationButton} ${styles.paginationButtonDisabled}`}>Next</span>
      )}
    </div>
  );
}
