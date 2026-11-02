'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatTime12, isValidTimeHHMM } from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';

const PRESETS = ['09:00', '12:00', '15:00', '18:00'];
/** Where editing starts when there's no time yet */
const BASE = '09:00';

function to12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return { h12: h % 12 || 12, m, pm: h >= 12 };
}

function from12(h12: number, m: number, pm: boolean): string {
  const h = (h12 % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const filled = { background: 'var(--assistant-accent)', color: 'var(--assistant-contrast-text, #fff)' } as const;

/**
 * "HH:MM" (24h) editor in the date pickers' look: quick times, then hour : minute
 * fields (type, or ↑/↓) and an AM/PM toggle. `optional` adds "No time" (value '').
 */
export function TimePicker({
  value,
  onChange,
  optional = false,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  optional?: boolean;
}) {
  const valid = isValidTimeHHMM(value);
  const { h12, m, pm } = to12(valid ? value : BASE);
  // What's typed into a field while it has focus
  const [draft, setDraft] = useState<{ field: 'h' | 'm'; text: string } | null>(null);

  const set = (next: Partial<{ h12: number; m: number; pm: boolean }>) =>
    onChange(from12(next.h12 ?? h12, next.m ?? m, next.pm ?? pm));

  const type = (field: 'h' | 'm', raw: string) => {
    const text = raw.replace(/\D/g, '').slice(0, 2);
    setDraft({ field, text });
    const n = Number(text);
    if (!text) return;
    if (field === 'h' && n >= 1 && n <= 12) set({ h12: n });
    if (field === 'm' && n <= 59) set({ m: n });
  };

  const step = (field: 'h' | 'm', e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); e.preventDefault(); return; }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const dir = e.key === 'ArrowUp' ? 1 : -1;
    setDraft(null);
    if (field === 'h') set({ h12: ((h12 - 1 + dir + 12) % 12) + 1 });
    // Minutes move in 5s, snapping to the grid first
    else set({ m: (Math.round(m / 5) * 5 + dir * 5 + 60) % 60 });
  };

  const field = (f: 'h' | 'm', shown: string, label: string) => (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={draft?.field === f ? draft.text : valid ? shown : ''}
      placeholder="--"
      onFocus={e => { setDraft({ field: f, text: '' }); e.target.select(); }}
      onChange={e => type(f, e.target.value)}
      onKeyDown={e => step(f, e)}
      onBlur={() => setDraft(null)}
      className={`h-9 w-11 rounded-md text-center text-[15px] font-semibold tabular-nums ${classes.panelInput}`}
      style={{ color: 'var(--assistant-text)' }}
    />
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {optional ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className={`text-[12px] px-2.5 py-1 rounded-full ${valid ? classes.quickFilterInactive : ''}`}
            style={valid ? undefined : filled}
          >
            No time
          </button>
        ) : null}
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`text-[12px] px-2.5 py-1 rounded-full ${value === p ? '' : classes.quickFilterInactive}`}
            style={value === p ? filled : undefined}
          >
            {formatTime12(p)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {field('h', String(h12), 'Hour')}
        <span className="text-[15px] font-semibold" style={{ color: 'var(--assistant-text-faint)' }}>:</span>
        {field('m', String(m).padStart(2, '0'), 'Minutes')}
        <div className="ml-1.5 flex gap-1" role="group" aria-label="AM or PM">
          {(['AM', 'PM'] as const).map(p => {
            const on = valid && pm === (p === 'PM');
            return (
              <button
                key={p}
                type="button"
                onClick={() => set({ pm: p === 'PM' })}
                aria-pressed={on}
                className={`h-9 rounded-md px-2.5 text-[12px] font-semibold ${on ? '' : classes.quickFilterInactive}`}
                style={on ? filled : undefined}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Time-only picker in the date pickers' look (mount it to open it). */
export function TimePickerModal({
  title = 'Select a time',
  subtitle,
  value,
  optional = false,
  onPick,
  onClose,
}: {
  title?: string;
  subtitle?: string;
  value?: string;
  optional?: boolean;
  onPick: (hhmm: string) => void;
  onClose: () => void;
}) {
  const [time, setTime] = useState(isValidTimeHHMM(value) ? value : optional ? '' : BASE);

  useEffect(() => {
    // Capture + stop so Escape closes only the picker, not the modal it was opened from
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const canApply = optional ? time === '' || isValidTimeHHMM(time) : isValidTimeHHMM(time);
  const apply = () => {
    if (!canApply) return;
    onPick(time);
    onClose();
  };
  // React events bubble through the portal to whatever row/form opened the picker — keep them here
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center"
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
      onKeyDown={stop}
    >
      <button type="button" className={`absolute inset-0 ${classes.modalBackdrop}`} onClick={onClose} aria-label="Close" />
      <form
        role="dialog"
        aria-label={title}
        className={`relative w-[92vw] max-w-sm ${classes.modalCard}`}
        // stopPropagation: a submit would otherwise also reach the form that opened the picker
        onSubmit={e => { e.preventDefault(); e.stopPropagation(); apply(); }}
      >
        <div className={classes.modalHeader}>
          <div className={classes.modalTitle}>{title}</div>
          <div className="mt-1 break-words text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
            {subtitle || (isValidTimeHHMM(time) ? formatTime12(time) : 'No time')}
          </div>
        </div>
        <div className="px-6 pt-4">
          <TimePicker value={time} onChange={setTime} optional={optional} />
        </div>
        <div className={`${classes.modalFooter} justify-end`}>
          <button type="button" onClick={onClose} className={`text-[13px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canApply}
            className={`text-[13px] font-semibold px-3 py-2 rounded-md disabled:opacity-40 ${classes.quickModalPrimary}`}
          >
            Apply
          </button>
        </div>
      </form>
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}

/** Form field that shows the time and opens the picker — stands in for `<input type="time">`. */
export function TimeField({
  value,
  onChange,
  optional = false,
  title,
  placeholder = 'No time',
  className = '',
  style,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  optional?: boolean;
  title?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const label = isValidTimeHHMM(value) ? formatTime12(value) : '';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center justify-between gap-2 text-left ${className}`}
        style={style}
      >
        <span className="truncate" style={label ? undefined : { color: 'var(--assistant-text-faint)' }}>{label || placeholder}</span>
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 4.6V8l2.3 1.5" />
        </svg>
      </button>
      {open ? (
        <TimePickerModal title={title} value={value} optional={optional} onPick={onChange} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
