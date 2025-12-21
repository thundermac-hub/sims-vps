'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './tickets.module.css';

interface DateRangePickerProps {
  from?: string | null;
  to?: string | null;
  timezone: string;
}

interface CalendarDay {
  date: Date;
  inCurrentMonth: boolean;
}

const displayFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone,
  });

const monthFormatter = (timeZone: string) => new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone });

function getNowInTimeZone(timeZone: string): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone }));
}

function parseISODate(value: string | null | undefined, timeZone: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const zoned = getNowInTimeZone(timeZone);
  zoned.setHours(0, 0, 0, 0);
  zoned.setFullYear(year, month - 1, day);
  return zoned;
}

function formatDateString(value: Date | null) {
  if (!value) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplay(start: Date | null, end: Date | null, formatter: Intl.DateTimeFormat) {
  if (!start && !end) return 'Select date';
  if (start && !end) return formatter.format(start);
  if (start && end && isSameDay(start, end)) return formatter.format(start);
  if (start && end) return `${formatter.format(start)} – ${formatter.format(end)}`;
  return 'Select date';
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7; // Monday start
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addMonths(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

function isSameDay(a: Date | null, b: Date | null) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isWithinRange(date: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return false;
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function buildCalendar(month: Date): CalendarDay[] {
  const firstDay = startOfMonth(month);
  const startWeekday = firstDay.getDay();
  const days: CalendarDay[] = [];

  for (let i = startWeekday - 1; i >= 0; i -= 1) {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() - i - 1);
    days.push({ date, inCurrentMonth: false });
  }

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let i = 0; i < daysInMonth; i += 1) {
    const date = new Date(month);
    date.setDate(i + 1);
    days.push({ date, inCurrentMonth: true });
  }

  while (days.length % 7 !== 0) {
    const previous = days[days.length - 1].date;
    const date = new Date(previous);
    date.setDate(previous.getDate() + 1);
    days.push({ date, inCurrentMonth: false });
  }

  return days;
}

export default function DateRangePicker({ from, to, timezone }: DateRangePickerProps) {
  const formatter = useMemo(() => displayFormatter(timezone), [timezone]);
  const monthLabelFormatter = useMemo(() => monthFormatter(timezone), [timezone]);
  const getToday = useCallback(() => {
    const today = getNowInTimeZone(timezone);
    today.setHours(0, 0, 0, 0);
    return today;
  }, [timezone]);
  const router = useRouter();
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initialStart = parseISODate(from, timezone);
  const initialEnd = parseISODate(to ?? from, timezone);

  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(initialStart ?? getToday()));
  const [startDate, setStartDate] = useState<Date | null>(initialStart);
  const [endDate, setEndDate] = useState<Date | null>(initialEnd);

  useEffect(() => {
    setStartDate(parseISODate(from, timezone));
    setEndDate(parseISODate(to ?? from, timezone));
  }, [from, to, timezone]);

  const commitRange = useCallback(
    async (start: Date | null, end: Date | null) => {
      const startString = formatDateString(start);
      const endString = formatDateString(end);
      try {
        await fetch('/api/preferences/date-range', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            from: startString,
            to: endString,
          }),
        });
      } catch (error) {
        console.error('Failed to persist date range', error);
      }
      router.replace(pathname, { scroll: false });
      router.refresh();
    },
    [pathname, router],
  );

  const closePopover = useCallback(() => {
    void commitRange(startDate, endDate ?? startDate ?? null);
    setIsOpen(false);
  }, [commitRange, endDate, startDate]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      closePopover();
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closePopover, isOpen]);

  const handleSelect = useCallback(
    (date: Date) => {
      if (!startDate || (startDate && endDate && !isSameDay(startDate, endDate))) {
        setStartDate(date);
        setEndDate(null);
        return;
      }
      if (!endDate) {
        if (date < startDate) {
          setEndDate(startDate);
          setStartDate(date);
        } else if (isSameDay(date, startDate)) {
          setEndDate(date);
        } else {
          setEndDate(date);
        }
      } else {
        setStartDate(date);
        setEndDate(null);
      }
    },
    [endDate, startDate],
  );

  const handleApply = useCallback(() => {
    closePopover();
  }, [closePopover]);

  const handleClear = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
    void commitRange(null, null);
    setIsOpen(false);
  }, [commitRange]);

  const label = useMemo(() => formatDisplay(startDate, endDate, formatter), [startDate, endDate, formatter]);

  const shiftRange = useCallback(
    (direction: -1 | 1) => {
      const baseStart = startDate ?? endDate ?? getToday();

      const baseEnd =
        endDate ??
        startDate ??
        getToday();

      const dayDiff = Math.floor((baseEnd.getTime() - baseStart.getTime()) / (1000 * 60 * 60 * 24));
      const daySpan = dayDiff >= 0 ? dayDiff + 1 : 1;

      const newStart = new Date(baseStart);
      newStart.setDate(baseStart.getDate() + direction * daySpan);

      const newEnd = new Date(baseEnd);
      newEnd.setDate(baseEnd.getDate() + direction * daySpan);

      setStartDate(newStart);
      setEndDate(daySpan === 1 ? newStart : newEnd);
      void commitRange(newStart, daySpan === 1 ? newStart : newEnd);
    },
    [commitRange, endDate, getToday, startDate],
  );

  const quickRanges = useMemo(() => {
    const today = getToday();

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const thisWeekStart = startOfWeek(today);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(thisWeekStart.getDate() - 1);

    const thisMonthStart = startOfMonth(today);
    const lastMonthStart = startOfMonth(addMonths(today, -1));
    const lastMonthEnd = new Date(thisMonthStart);
    lastMonthEnd.setDate(0);

    return [
      {
        label: 'Today',
        start: today,
        end: today,
      },
      {
        label: 'Yesterday',
        start: yesterday,
        end: yesterday,
      },
      {
        label: 'This week',
        start: thisWeekStart,
        end: today,
      },
      {
        label: 'Last week',
        start: lastWeekStart,
        end: lastWeekEnd,
      },
      {
        label: 'This month',
        start: thisMonthStart,
        end: today,
      },
      {
        label: 'Last month',
        start: lastMonthStart,
        end: lastMonthEnd,
      },
    ];
  }, [getToday]);

  const applyQuickRange = useCallback(
    (start: Date, end: Date) => {
      setStartDate(start);
      setEndDate(end);
      void commitRange(start, end);
      setIsOpen(false);
    },
    [commitRange],
  );

  const togglePopover = useCallback(() => {
    if (isOpen) {
      closePopover();
    } else {
      setIsOpen(true);
    }
  }, [closePopover, isOpen]);

  const renderGrid = (month: Date) => {
    const days = buildCalendar(month);
    const monthLabel = monthLabelFormatter.format(month);
    return (
      <div className={styles.calendarMonth} key={monthLabel}>
        <header className={styles.calendarHeader}>{monthLabel}</header>
        <div className={styles.calendarWeekdays}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className={styles.calendarGrid}>
          {days.map(({ date, inCurrentMonth }) => {
            const isStart = isSameDay(date, startDate);
            const isEnd = isSameDay(date, endDate);
            const highlighted = isWithinRange(date, startDate, endDate);
            return (
              <button
                type="button"
                key={date.toISOString()}
                disabled={!inCurrentMonth}
                onClick={() => handleSelect(date)}
                className={[
                  styles.calendarCell,
                  !inCurrentMonth ? styles.calendarCellMuted : '',
                  highlighted ? styles.calendarCellInRange : '',
                  isStart || isEnd ? styles.calendarCellSelected : '',
                ].join(' ')}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.rangePickerContainer} ref={containerRef}>
      <label className={styles.rangeLabel}>Date range</label>
      <div className={styles.rangeTriggerButtons}>
        <button
          type="button"
          className={styles.rangeArrowButton}
          onClick={() => shiftRange(-1)}
          aria-label="Previous period"
        >
          ‹
        </button>
        <button type="button" className={styles.rangeTrigger} onClick={togglePopover}>
          {label}
        </button>
        <button
          type="button"
          className={styles.rangeArrowButton}
          onClick={() => shiftRange(1)}
          aria-label="Next period"
        >
          ›
        </button>
      </div>
      {isOpen ? (
        <div className={styles.rangePopover}>
          <div className={styles.rangePopoverContent}>
            <div>
              <div className={styles.calendarToolbar}>
                <button
                  type="button"
                  className={styles.toolbarButton}
                  onClick={() => setViewMonth((prev) => addMonths(prev, -1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.toolbarButton}
                  onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
              <div className={styles.calendarBody}>{renderGrid(viewMonth)}</div>
            </div>
            <div className={styles.quickRangeColumn}>
              {quickRanges.map((range) => (
                <button
                  key={range.label}
                  type="button"
                  className={styles.quickRangeButton}
                  onClick={() => applyQuickRange(range.start, range.end)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.rangeActions}>
            <button type="button" className={styles.rangeActionGhost} onClick={handleClear}>
              Clear
            </button>
            <button
              type="button"
              className={styles.rangeActionPrimary}
              onClick={handleApply}
              disabled={!startDate}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
