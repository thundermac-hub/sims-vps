'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

interface SearchKeywordInputProps {
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  onSearch: (formData: FormData) => void | Promise<void>;
}

const DEBOUNCE_MS = 400;

export default function SearchKeywordInput({
  name = 'q',
  placeholder = 'Search…',
  defaultValue = '',
  onSearch,
}: SearchKeywordInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [, startTransition] = useTransition();
  const isFirstChangeRef = useRef(true);
  const skipNextRef = useRef(false);
  const lastSubmittedRef = useRef(defaultValue);
  const router = useRouter();

  useEffect(() => {
    setValue((previous) => {
      if (previous === defaultValue) {
        return previous;
      }
      skipNextRef.current = true;
      return defaultValue;
    });
    lastSubmittedRef.current = defaultValue;
  }, [defaultValue]);

  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return undefined;
    }
    if (isFirstChangeRef.current) {
      isFirstChangeRef.current = false;
      return undefined;
    }
    if (value === lastSubmittedRef.current) {
      return undefined;
    }
    const handle = setTimeout(() => {
      lastSubmittedRef.current = value;
      const formData = new FormData();
      formData.set('intent', 'instant');
      formData.set(name, value);
      startTransition(() => {
        void (async () => {
          try {
            await onSearch(formData);
          } catch (error) {
            console.error('Failed to apply search filter', error);
          }
          router.refresh();
        })();
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value, name, onSearch, startTransition, router]);

  return (
    <input
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      aria-label="Keyword search"
      autoComplete="off"
    />
  );
}
