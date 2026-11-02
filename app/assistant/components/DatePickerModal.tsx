'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDaysYMD, formatPill, formatTime12, isValidDateYYYYMMDD, isValidTimeHHMM, monthStartYMD, todayYMD } from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';
import { CalendarIcon } from '@/app/assistant/_icons/CalendarIcon';
import { CalendarMonth } from './CalendarMonth';
import { TimePicker } from './TimePicker';

/**
 * Single-day picker in the same look as the date range dialog: pick a day
 * (or a preset), then Apply. Double-clicking a day applies it right away.
 * `withTime` adds the hour under the calendar (optional unless `timeRequired`).
 */
export function DatePickerModal({
  title = 'Select a date',
  subtitle,
  value,
  min,
  withTime = false,
  time,
  timeRequired = false,
  onPick,
  onClear,
  onClose,
}: {
  title?: string;
  /** Shown under the title instead of the picked date (e.g. the task's text) */
  subtitle?: string;
  value?: string;
  /** Days before this can't be picked */
  min?: string;
  /** Date + time variant: pick the hour too ("HH:MM", '' = no time) */
  withTime?: boolean;
  time?: string;
  /** With `withTime`: there's no "No time" choice */
  timeRequired?: boolean;
  /** `time` is passed in the date + time variant ('' when none was picked) */
  onPick: (ymd: string, time?: string) => void;
  /** Adds a "Clear" button that removes the date */
  onClear?: () => void;
  onClose: () => void;
}) {
  const today = todayYMD();
  const [selected, setSelected] = useState<string | null>(isValidDateYYYYMMDD(value) ? value : null);
  const [month, setMonth] = useState(monthStartYMD(selected ?? today));
  const [hhmm, setHhmm] = useState(isValidTimeHHMM(time) ? time : timeRequired ? '09:00' : '');
  const timeOk = !withTime || (timeRequired ? isValidTimeHHMM(hhmm) : hhmm === '' || isValidTimeHHMM(hhmm));

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

  const apply = (ymd: string | null) => {
    if (!ymd || !timeOk) return;
    if (withTime) onPick(ymd, hhmm);
    else onPick(ymd);
    onClose();
  };

  const presets: [string, string][] = [
    ['Today', today],
    ['Tomorrow', addDaysYMD(today, 1)],
    ['Next week', addDaysYMD(today, 7)],
  ];
  const preset = (ymd: string) => { setSelected(ymd); setMonth(monthStartYMD(ymd)); };

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
      <div role="dialog" aria-label={title} className={`relative w-[92vw] max-w-sm max-h-[94vh] overflow-y-auto ${classes.modalCard}`}>
        <div className={classes.modalHeader}>
          <div className={classes.modalTitle}>{title}</div>
          <div className="mt-1 break-words text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
            {subtitle || (selected
              ? `${formatPill(selected)}${withTime && isValidTimeHHMM(hhmm) ? ` · ${formatTime12(hhmm)}` : ''}`
              : 'Pick a day')}
          </div>
        </div>

        <div className="px-6 pt-4">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {presets.map(([label, ymd]) => (
              <button
                key={label}
                type="button"
                disabled={!!min && ymd < min}
                onClick={() => preset(ymd)}
                className={`text-[12px] px-2.5 py-1 rounded-full disabled:opacity-40 ${classes.quickFilterInactive}`}
              >
                {label}
              </button>
            ))}
          </div>

          <CalendarMonth
            month={month}
            onMonthChange={setMonth}
            lo={selected}
            hi={selected}
            min={min}
            onPick={setSelected}
            onDoublePick={apply}
          />

          {withTime ? (
            <div className="mt-4">
              <div className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--assistant-text)' }}>Time</div>
              <TimePicker value={hhmm} onChange={setHhmm} optional={!timeRequired} />
            </div>
          ) : null}
        </div>

        <div className={classes.modalFooter}>
          {onClear && isValidDateYYYYMMDD(value) ? (
            <button
              type="button"
              onClick={() => { onClear(); onClose(); }}
              className={`mr-auto text-[13px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}
            >
              Clear
            </button>
          ) : null}
          <button type="button" onClick={onClose} className={`ml-auto text-[13px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || !timeOk}
            onClick={() => apply(selected)}
            className={`text-[13px] font-semibold px-3 py-2 rounded-md disabled:opacity-40 ${classes.quickModalPrimary}`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}

/** Form field that shows the date and opens the picker — stands in for `<input type="date">`. */
export function DateField({
  value,
  onChange,
  onClear,
  min,
  title,
  placeholder = 'Pick a date',
  className = '',
  style,
}: {
  value?: string;
  onChange: (ymd: string) => void;
  onClear?: () => void;
  min?: string;
  title?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const label = formatPill(value);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center justify-between gap-2 text-left ${className}`}
        style={style}
      >
        <span className="truncate" style={label ? undefined : { color: 'var(--assistant-text-faint)' }}>{label || placeholder}</span>
        <CalendarIcon className="size-3.5 shrink-0 opacity-60" />
      </button>
      {open ? (
        <DatePickerModal title={title} value={value} min={min} onPick={onChange} onClear={onClear} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
