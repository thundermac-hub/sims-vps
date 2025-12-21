'use client';

import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState, useTransition } from 'react';

interface StatusFilterSelectProps {
  name?: string;
  defaultValue?: string;
  options: readonly string[];
  onStatusChange: (formData: FormData) => void | Promise<void>;
}

export default function StatusFilterSelect({
  name = 'status',
  defaultValue = '',
  options,
  onStatusChange,
}: StatusFilterSelectProps) {
  const [value, setValue] = useState(defaultValue);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);
    const formData = new FormData();
    formData.set('intent', 'instant');
    formData.set(name, nextValue);
    startTransition(() => {
      void (async () => {
        try {
          await onStatusChange(formData);
        } catch (error) {
          console.error('Failed to apply status filter', error);
        }
        router.refresh();
      })();
    });
  };

  return (
    <select name={name} value={value} onChange={handleChange}>
      <option value="">All statuses</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
