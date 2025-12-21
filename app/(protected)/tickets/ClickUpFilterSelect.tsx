'use client';

import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState, useTransition } from 'react';

type ClickUpFilterValue = '' | 'with' | 'without';

interface ClickUpFilterSelectProps {
  name?: string;
  defaultValue?: ClickUpFilterValue;
  onChangeFilter: (formData: FormData) => void | Promise<void>;
}

export default function ClickUpFilterSelect({
  name = 'clickup',
  defaultValue = '',
  onChangeFilter,
}: ClickUpFilterSelectProps) {
  const [value, setValue] = useState<ClickUpFilterValue>(defaultValue ?? '');
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setValue(defaultValue ?? '');
  }, [defaultValue]);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value as ClickUpFilterValue;
    setValue(nextValue);
    const formData = new FormData();
    formData.set('intent', 'instant');
    formData.set(name, nextValue);
    startTransition(() => {
      void (async () => {
        try {
          await onChangeFilter(formData);
        } catch (error) {
          console.error('Failed to apply ClickUp filter', error);
        }
        router.refresh();
      })();
    });
  };

  return (
    <select name={name} value={value} onChange={handleChange}>
      <option value="">All tickets</option>
      <option value="with">Has ClickUp task</option>
      <option value="without">No ClickUp task</option>
    </select>
  );
}
