'use client';

import { ChangeEvent, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ArchivedFilterSelectProps {
  defaultValue?: 'active' | 'archived' | 'all';
  onChangeFilter: (formData: FormData) => void | Promise<void>;
}

export default function ArchivedFilterSelect({ defaultValue = 'active', onChangeFilter }: ArchivedFilterSelectProps) {
  const [value, setValue] = useState(defaultValue);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const rawValue = event.target.value;
    const nextValue: 'active' | 'archived' | 'all' =
      rawValue === 'archived' ? 'archived' : rawValue === 'all' ? 'all' : 'active';
    setValue(nextValue);
    const formData = new FormData();
    formData.set('intent', 'instant');
    formData.set('archived', nextValue);
    startTransition(() => {
      void (async () => {
        try {
          await onChangeFilter(formData);
        } catch (error) {
          console.error('Failed to apply archived filter', error);
        }
        router.refresh();
      })();
    });
  };

  return (
    <select name="archived" value={value} onChange={handleChange}>
      <option value="active">Active only</option>
      <option value="archived">Archived only</option>
      <option value="all">All tickets</option>
    </select>
  );
}
