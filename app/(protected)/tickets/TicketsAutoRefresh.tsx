'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TicketsAutoRefreshProps {
  interval?: number;
}

export default function TicketsAutoRefresh({ interval = 15000 }: TicketsAutoRefreshProps) {
  const router = useRouter();
  const [paused, setPaused] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (detail && typeof detail.open === 'boolean') {
        setPaused(detail.open);
      }
    };
    window.addEventListener('tickets-modal-toggle', handleToggle as EventListener);
    return () => {
      window.removeEventListener('tickets-modal-toggle', handleToggle as EventListener);
    };
  }, []);

  useEffect(() => {
    const updateVisibility = () => setHidden(document.visibilityState === 'hidden');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (paused || hidden) {
      return undefined;
    }
    const id = setInterval(() => {
      router.refresh();
    }, interval);
    return () => clearInterval(id);
  }, [router, interval, paused, hidden]);

  return null;
}
