'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type TaskFlagColor,
  uid,
  todayYMD,
  isValidDateYYYYMMDD,
  isValidTimeHHMM,
  getTaskFlag,
  readRemindersLS,
  writeRemindersLS,
} from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';

type ReminderSource = {
  text?: string;
  deadline?: string;
  flag?: TaskFlagColor;
  priority?: boolean;
};

/** Clock button next to a task's flag — opens a modal to save that task as a reminder. */
export function TaskReminderButton({ task }: { task: ReminderSource }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState('11:00');
  // Date comes from the task's due date (today when it has none) — the modal only asks for the hour
  const date = isValidDateYYYYMMDD(task.deadline) ? task.deadline! : todayYMD();

  const openModal = () => {
    setTime('11:00');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleSave = () => {
    if (!isValidTimeHHMM(time) || !isValidDateYYYYMMDD(date)) return;
    const { reminders } = readRemindersLS();
    // The Reminders panel seeds one empty placeholder row — replace it instead of stacking
    const existing = reminders.filter(r => (r.title || '').trim() !== '');
    writeRemindersLS({
      reminders: [
        ...existing,
        {
          id: uid(),
          title: (task.text || '').trim(),
          date,
          time,
          daily: false,
          flag: getTaskFlag(task),
        },
      ],
    });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openModal(); }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label="Set reminder"
        title="Set reminder"
        className="relative z-10 shrink-0 h-4 w-4 flex items-center justify-center select-none opacity-0 group-hover:opacity-40 hover:!opacity-80 hover:scale-110 transition-all duration-150"
        style={{ color: 'var(--assistant-text)' }}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 4.6V8l2.3 1.5" />
        </svg>
      </button>

      {open ? createPortal(
        <div className="fixed inset-0 z-[10050] flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-label="Close"
          />
          <form
            role="dialog"
            aria-label="Set reminder"
            className="relative w-[92vw] max-w-sm rounded-2xl shadow-2xl"
            style={{
              border: '1px solid var(--assistant-border-soft)',
              background: 'var(--assistant-panel-bg)',
            }}
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>Set reminder</div>
              {(task.text || '').trim() ? (
                <div className="mt-1 truncate text-[12px]" style={{ color: 'var(--assistant-text-faint)' }} title={task.text}>
                  {task.text}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 px-4 py-4">
              <span className="shrink-0 text-[13px] tabular-nums" style={{ color: 'var(--assistant-text-muted)' }}>
                {date.slice(5, 7)}/{date.slice(8, 10)}/{date.slice(0, 4)}
              </span>
              <input
                autoFocus
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className={`min-w-0 flex-1 text-[28px] font-semibold tabular-nums text-center px-3 py-2 rounded-lg ${classes.panelInput}`}
              />
            </div>

            <div className="px-4 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`${classes.modalSecondaryButton} text-[13px] px-3 py-2 rounded-md`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValidTimeHHMM(time) || !isValidDateYYYYMMDD(date)}
                className="text-[13px] font-semibold px-3 py-2 rounded-md transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
              >
                Accept
              </button>
            </div>
          </form>
        </div>,
        document.querySelector('[data-assistant-root]') ?? document.body,
      ) : null}
    </>
  );
}
