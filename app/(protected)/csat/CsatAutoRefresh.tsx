'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface CsatAutoRefreshProps {
  interval?: number;
}

export default function CsatAutoRefresh({ interval = 15000 }: CsatAutoRefreshProps) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setHidden(document.visibilityState === 'hidden');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (hidden) {
      return undefined;
    }
    const id = setInterval(() => {
      router.refresh();
    }, interval);
    return () => clearInterval(id);
  }, [router, interval, hidden]);

  return null;
}
