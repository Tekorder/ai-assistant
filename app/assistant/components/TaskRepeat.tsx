'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type Block,
  WEEKDAYS,
  todayYMD,
  parseYMD,
  isValidDateYYYYMMDD,
  isValidTimeHHMM,
  isRecurringTask,
  nextOccurrenceYMD,
} from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';
import { DateField } from './DatePickerModal';

const ALL_DAYS = WEEKDAYS.map(d => d.value);

/**
 * Makes a task recurring — same picks as a reminder: weekdays, start date and hour.
 * Mount it to open it; `onSave` gets the patch for the task.
 */
export function TaskRepeatModal({
  task,
  onSave,
  onClose,
}: {
  task: Pick<Block, 'text' | 'deadline' | 'dueTime' | 'repeatDays' | 'doneDates'>;
  onSave: (patch: Partial<Block>) => void;
  onClose: () => void;
}) {
  const recurring = isRecurringTask(task);
  const [start, setStart] = useState(isValidDateYYYYMMDD(task.deadline) ? task.deadline! : todayYMD());
  const [time, setTime] = useState(isValidTimeHHMM(task.dueTime) ? task.dueTime! : '');
  // A new repeat starts on the weekday of its date
  const [days, setDays] = useState<number[]>(recurring ? task.repeatDays! : [parseYMD(start).getDay()]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSave = days.length > 0 && isValidDateYYYYMMDD(start) && (time === '' || isValidTimeHHMM(time));

  const handleSave = () => {
    if (!canSave) return;
    const repeatDays = ALL_DAYS.filter(d => days.includes(d)).sort((a, b) => a - b);
    onSave({
      repeatDays,
      // The task sits on its first open occurrence from the start date on
      deadline: nextOccurrenceYMD(repeatDays, start, task.doneDates),
      dueTime: time || undefined,
      isHidden: false,
    });
    onClose();
  };

  const handleStop = () => {
    // Keeps the current date and hour; the done history goes with the repeat
    onSave({ repeatDays: undefined, doneDates: task.doneDates?.length ? [] : undefined });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center">
      <button
        type="button"
        className={`absolute inset-0 ${classes.modalBackdrop}`}
        onClick={onClose}
        aria-label="Close"
      />
      <form
        role="dialog"
        aria-label="Repeat task"
        className={`relative w-[92vw] max-w-sm ${classes.modalCard}`}
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
      >
        <div className={classes.modalHeader}>
          <div className={classes.modalTitle}>Repeat task</div>
          {(task.text || '').trim() ? (
            <div className="mt-1 break-words text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
              {task.text}
            </div>
          ) : null}
        </div>

        <div className="flex justify-between gap-1.5 px-6 pt-4" role="group" aria-label="Weekdays">
          {WEEKDAYS.map(d => {
            const on = days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => setDays(prev => (on ? prev.filter(x => x !== d.value) : [...prev, d.value]))}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${on ? '' : classes.modalSecondaryButton}`}
                style={on ? { background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' } : undefined}
                aria-pressed={on}
                aria-label={d.long}
                data-tip={d.long}
              >
                {d.letter}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 pt-3 text-[12px]">
          {[
            { label: 'Every day', days: ALL_DAYS },
            { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] },
            { label: 'Weekends', days: [6, 0] },
          ].map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDays(p.days)}
              className={`rounded-full px-2.5 py-1 ${classes.modalSecondaryButton}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 px-6 pt-4">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>Starts</span>
            <DateField
              title="Starts"
              value={start}
              onChange={setStart}
              className={`min-w-0 text-[13px] px-2 py-1.5 rounded-md ${classes.panelInput}`}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>Time (optional)</span>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className={`min-w-0 text-[13px] px-2 py-1.5 rounded-md ${classes.panelInput}`}
            />
          </label>
        </div>

        <div className={classes.modalFooter}>
          {recurring ? (
            <button
              type="button"
              onClick={handleStop}
              className={`${classes.modalSecondaryButton} text-[13px] px-3 py-2 rounded-md`}
              data-tip="Make it a one-time task again"
            >
              Don&apos;t repeat
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`${classes.modalSecondaryButton} text-[13px] px-3 py-2 rounded-md`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="text-[13px] font-semibold px-3 py-2 rounded-md transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
            >
              Accept
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}
