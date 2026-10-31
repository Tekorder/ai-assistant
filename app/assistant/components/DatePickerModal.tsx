'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { isValidDateYYYYMMDD, parseYMD, todayYMD, toYMD } from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function addDaysYMD(ymd: string, delta: number): string {
  const d = parseYMD(ymd);
  return toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
}

/** Modal month calendar — clicking a day picks it and closes. */
export function DatePickerModal({
  title,
  subtitle,
  value,
  onPick,
  onClose,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPick: (ymd: string) => void;
  onClose: () => void;
}) {
  const today = todayYMD();
  const initial = parseYMD(isValidDateYYYYMMDD(value) ? value! : today);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth()); // 0-based

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 6 weeks always, so the modal doesn't jump in height between months
  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const start = new Date(viewYear, viewMonth, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { ymd: toYMD(d), day: d.getDate(), inMonth: d.getMonth() === viewMonth };
    });
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const pick = (ymd: string) => {
    onPick(ymd);
    onClose();
  };

  const quick: [string, string][] = [
    ['Today', today],
    ['Tomorrow', addDaysYMD(today, 1)],
    ['Next week', addDaysYMD(today, 7)],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-5">
      <button
        type="button"
        className={`fixed inset-0 ${classes.modalBackdrop}`}
        onClick={onClose}
        aria-label="Close"
      />
      <div
        role="dialog"
        aria-label={title}
        className={`relative z-10 w-full max-w-[340px] ${classes.modalCard}`}
      >
        <div className={classes.modalHeader}>
          <div className={classes.modalTitle}>{title}</div>
          {subtitle ? (
            <div className="mt-0.5 break-words text-[12px]" style={{ color: 'var(--assistant-text-faint)' }} data-tip={subtitle}>
              {subtitle}
            </div>
          ) : null}
          <div className="mt-3 flex gap-1.5">
            {quick.map(([label, ymd]) => (
              <button
                key={label}
                type="button"
                onClick={() => pick(ymd)}
                className="rounded-full px-2.5 py-1 text-[12px] transition-colors"
                style={
                  value === ymd
                    ? { background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }
                    : { color: 'var(--assistant-text-soft)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="h-7 w-7 rounded-md text-[16px] transition-opacity hover:opacity-70"
              style={{ color: 'var(--assistant-text-soft)' }}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="text-[14px] font-semibold">
              {new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="h-7 w-7 rounded-md text-[16px] transition-opacity hover:opacity-70"
              style={{ color: 'var(--assistant-text-soft)' }}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map(w => (
              <div key={w} className="py-1 text-[11px] font-medium" style={{ color: 'var(--assistant-text-faint)' }}>
                {w}
              </div>
            ))}
            {cells.map(c => {
              const selected = c.ymd === value;
              const isToday = c.ymd === today;
              return (
                <button
                  key={c.ymd}
                  type="button"
                  onClick={() => pick(c.ymd)}
                  aria-label={c.ymd}
                  aria-pressed={selected}
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors hover:bg-[color-mix(in_srgb,var(--assistant-text)_8%,transparent)]"
                  style={
                    selected
                      ? { background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)', fontWeight: 600 }
                      : {
                          color: c.inMonth ? 'var(--assistant-text)' : 'var(--assistant-text-faint)',
                          fontWeight: isToday ? 700 : 400,
                          boxShadow: isToday ? 'inset 0 0 0 1px var(--assistant-accent)' : undefined,
                        }
                  }
                >
                  {c.day}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${classes.modalFooter} justify-end`}>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] px-3 py-2 rounded-lg"
            style={{ color: 'var(--assistant-text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}
