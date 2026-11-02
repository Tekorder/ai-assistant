'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type ReminderItem,
  LS_KEY_REMINDERS,
  arrayMove,
  isValidDateYYYYMMDD,
  isValidTimeHHMM,
  todayYMD,
  formatPill,
  formatTime12,
  repeatDaysLabel,
  makeDefaultReminder,
  ensureOneReminder,
  readRemindersLS,
  writeRemindersLS,
  insertReminderAfter as insertReminderAfterArr,
  removeReminder as removeReminderArr,
  updateReminder as updateReminderArr,
} from '@/lib/datacenter';
import { createPortal } from 'react-dom';
import { TaskFlagButton } from './TaskFlag';
import { AddButton } from './AddButton';
import { ReminderRow, ReminderIcon, ReminderTimeChip, ReminderDoneButton, type ReminderChipState } from './ReminderRow';
import { DatePickerModal } from './DatePickerModal';
import { TimePickerModal } from './TimePicker';
import { reminderFallsOn } from '../_utils/reminderSchedule';
import { HabitRemindersSection } from './habits/HabitRemindersSection';
import classes from '@/app/assistant/_theme/themes.module.css';

/** Mon-first display order; values are JS weekdays (0 = Sun). */
const WEEK: { value: number; short: string; letter: string }[] = [
  { value: 1, short: 'Mon', letter: 'M' },
  { value: 2, short: 'Tue', letter: 'T' },
  { value: 3, short: 'Wed', letter: 'W' },
  { value: 4, short: 'Thu', letter: 'T' },
  { value: 5, short: 'Fri', letter: 'F' },
  { value: 6, short: 'Sat', letter: 'S' },
  { value: 0, short: 'Sun', letter: 'S' },
];
const ALL_DAYS = WEEK.map(d => d.value);

/** Local "YYYY-MM-DDTHH:MM" for comparing against a reminder's date + time. */
function localNowKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const BellIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 11.5V7a4 4 0 1 1 8 0v4.5l1 1H3z" />
    <path d="M6.75 14a1.4 1.4 0 0 0 2.5 0" />
  </svg>
);

/** Small icon buttons on the right of a row: show on hover. */
const hoverIconClass =
  'shrink-0 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity';

type Props = {
  open: boolean;
  onClose: () => void;
  /** tab: a main-panel tab — no frame, title or close button */
  variant?: 'overlay' | 'dock' | 'tab';
};

export default function RemindersPanel({ open, onClose, variant = 'overlay' }: Props) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([makeDefaultReminder()]);
  const reminderTitleRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  // Reminder whose date + time (or, when repeating, just time) picker is open
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const newTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [daysModal, setDaysModal] = useState<{ id: string; days: number[] } | null>(null);
  const [nowKey, setNowKey] = useState(localNowKey);

  // Re-check every 30s so a reminder flips to "Dismiss" once its time passes
  useEffect(() => {
    const t = window.setInterval(() => setNowKey(localNowKey()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!daysModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDaysModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [daysModal]);

  useEffect(() => {
    const load = () => {
      const p = readRemindersLS();
      const next = ensureOneReminder(p.reminders);
      setReminders(next);
      if (JSON.stringify(p.reminders) !== JSON.stringify(next)) writeRemindersLS({ reminders: next });
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_REMINDERS) load();
    };
    window.addEventListener('youtask_reminders_updated', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_reminders_updated', load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Grow each title textarea to fit its wrapped text
  useLayoutEffect(() => {
    Object.values(reminderTitleRefs.current).forEach(el => {
      if (!el) return;
      el.style.height = '1px';
      el.style.height = el.scrollHeight + 'px';
    });
  });

  useEffect(() => {
    return () => {
      if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }
    if (!shouldRender) return;
    setIsClosing(true);
    const t = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, 260);
    return () => window.clearTimeout(t);
  }, [open, shouldRender]);

  const requestClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, 220);
  };

  const focusReminder = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = reminderTitleRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else el.setSelectionRange(0, 0);
    });
  };

  const openDaysModal = (r: ReminderItem) =>
    setDaysModal({ id: r.id, days: r.daily && r.days?.length ? r.days : ALL_DAYS });

  const triggerNewLineAnim = (id: string) => {
    setNewId(id);
    if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    newTimerRef.current = window.setTimeout(() => setNewId(null), 220);
  };

  const persistReminders = (next: ReminderItem[]) => {
    setReminders(next);
    writeRemindersLS({ reminders: next });
  };

  const handleAddReminder = () => {
    const next = makeDefaultReminder();
    persistReminders([...reminders, next]);
    focusReminder(next.id, false);
  };

  const handleUpdateReminder = (id: string, patch: Partial<ReminderItem>) => {
    persistReminders(updateReminderArr(reminders, id, patch));
  };

  const handleRemoveReminder = (id: string) => {
    const result = removeReminderArr(reminders, id);
    persistReminders(result.reminders);
    focusReminder(result.focusId, result.reminders.length === 1);
  };

  const handleInsertReminderAfter = (id: string) => {
    const result = insertReminderAfterArr(reminders, id);
    persistReminders(result.reminders);
    triggerNewLineAnim(result.newReminder.id);
    focusReminder(result.newReminder.id, false);
  };

  const handleReminderKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, r: ReminderItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInsertReminderAfter(r.id);
      return;
    }
    if (e.key === 'Backspace' && r.title === '') {
      e.preventDefault();
      handleRemoveReminder(r.id);
    }
  };

  const onDragStartRow = (e: React.DragEvent, id: string, index: number) => {
    dragRef.current = { id, fromIndex: index };
    setDragOverId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
  };

  const onDragOverRow = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragRef.current) return;
    if (dragOverId !== overId) setDragOverId(overId);
  };

  const onDropRow = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag) return;
    const toIndex = reminders.findIndex(r => r.id === overId);
    if (toIndex < 0) return;
    persistReminders(arrayMove(reminders, drag.fromIndex, toIndex));
    dragRef.current = null;
    setDragOverId(null);
  };

  const onDragEndRow = () => {
    dragRef.current = null;
    setDragOverId(null);
  };

  if (!shouldRender) return null;

  const panelAnim = isClosing
    ? 'remindersPanelOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
    : 'remindersPanelIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both';

  const body = (
    <>
      <style>{`
        @keyframes remindersPanelIn {
          from { transform: translateX(-34px); opacity: 0; filter: blur(1px); }
          60% { transform: translateX(3px); opacity: .92; filter: blur(0); }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes remindersPanelOut {
          from { transform: translateX(0); opacity: 1; filter: blur(0); }
          to { transform: translateX(14px); opacity: 0; filter: blur(1px); }
        }
      `}</style>

      {variant !== 'tab' && (
        <div className="flex h-[49px] items-center justify-between px-4 shrink-0"
          style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
          <h2 className="text-[16px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Reminders</h2>
          <button type="button" onClick={requestClose}
            className={`h-8 w-8 rounded-lg ${classes.panelCloseBtn}`} aria-label="Close">
            ✕
          </button>
        </div>
      )}

      <div className="px-4 py-3 shrink-0 flex items-center justify-end">
        <AddButton label="New reminder" onClick={handleAddReminder} compact={variant !== 'tab'} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* As a main tab there's room for two columns */}
        <div className={variant === 'tab' ? 'grid grid-cols-1 gap-x-8 gap-y-1 lg:grid-cols-2' : 'space-y-1'}>
          {reminders.map((r, idx) => {
            const isDraggingOver = dragOverId === r.id && dragRef.current?.id !== r.id;
            const isDraggingMe = dragRef.current?.id === r.id;
            const ymd = isValidDateYYYYMMDD(r.date) ? r.date : todayYMD();
            const hhmm = isValidTimeHHMM(r.time) ? r.time : '11:00';
            // One-off reminders whose date + time already went by (zero-padded, so string compare works)
            const isPast = !r.daily && r.title.trim() !== '' && `${ymd}T${hhmm}` < nowKey;
            // Today's time chip: same states as the habit reminders below
            const today = nowKey.slice(0, 10);
            const chip: ReminderChipState = !reminderFallsOn(r, today) ? 'off'
              : r.dismissedOn === today ? 'done'
              : hhmm <= nowKey.slice(11) ? 'due'
              : 'upcoming';
            return (
              <ReminderRow
                key={r.id}
                draggable
                onDragStart={e => onDragStartRow(e, r.id, idx)}
                onDragOver={e => onDragOverRow(e, r.id)}
                onDrop={e => onDropRow(e, r.id)}
                onDragEnd={onDragEndRow}
                // A plain reminder reads like a habit without a color of its own
                className={[
                  'yt-habit',
                  isDraggingOver ? classes.dragOver : '',
                  isDraggingMe ? 'opacity-60' : '',
                  newId === r.id ? 'wadu-line-in' : '',
                ].join(' ')}
                icon={<ReminderIcon><BellIcon /></ReminderIcon>}
                title={
                  <textarea
                    ref={el => void (reminderTitleRefs.current[r.id] = el)}
                    rows={1}
                    value={r.title}
                    placeholder="Reminder…"
                    onChange={e => handleUpdateReminder(r.id, { title: e.target.value })}
                    onKeyDown={e => handleReminderKey(e, r)}
                    className="block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent outline-none text-[14px] font-medium leading-[1.45] min-h-[1.45em]"
                    style={{ color: isPast ? 'var(--assistant-text-faint)' : 'var(--assistant-text-soft)' }}
                  />
                }
                // Repeating reminders fire on their weekdays — the date only matters for "Once"
                meta={
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => (r.daily ? openDaysModal(r) : setPickerId(r.id))}
                      className="hover:underline"
                      data-tip={r.daily ? 'Change days' : 'Change date'}
                    >
                      {r.daily ? repeatDaysLabel(r.days?.length ? r.days : ALL_DAYS) : formatPill(ymd)}
                    </button>
                    {/* A one-off can be turned into a repeating one right from its date */}
                    {r.daily ? null : (
                      <button
                        type="button"
                        onClick={() => openDaysModal(r)}
                        className={hoverIconClass}
                        style={{ color: 'var(--assistant-text-faint)' }}
                        data-tip="Repeat"
                        aria-label="Repeat"
                      >
                        <span className="text-[13px] leading-none">↻</span>
                      </button>
                    )}
                  </span>
                }
                chips={<ReminderTimeChip label={formatTime12(hhmm)} state={chip} onClick={() => setPickerId(r.id)} />}
                actions={
                  <>
                    <TaskFlagButton
                      source={r}
                      onChange={(next) => handleUpdateReminder(r.id, { flag: next, priority: undefined })}
                    />
                    {/* Done: a one-off goes away, a repeating one is handled for today */}
                    {chip === 'due' || isPast ? (
                      <ReminderDoneButton
                        onClick={() => (r.daily ? handleUpdateReminder(r.id, { dismissedOn: today }) : handleRemoveReminder(r.id))}
                        tip={r.daily ? 'Done for today' : 'Done — remove it'}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleRemoveReminder(r.id)}
                      className={hoverIconClass}
                      style={{ color: 'var(--assistant-text-faint)' }}
                      data-tip="Delete"
                      aria-label="Delete"
                    >
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path strokeLinecap="round" d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                      </svg>
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
        <HabitRemindersSection columns={variant === 'tab'} />
      </div>

      {(() => {
        const r = pickerId ? reminders.find(x => x.id === pickerId) : undefined;
        if (!r) return null;
        const time = isValidTimeHHMM(r.time) ? r.time : '11:00';
        // Repeating reminders go by weekday, so they only pick the hour
        return r.daily ? (
          <TimePickerModal
            title="Reminder time"
            subtitle={r.title || undefined}
            value={time}
            onPick={t => handleUpdateReminder(r.id, { time: t })}
            onClose={() => setPickerId(null)}
          />
        ) : (
          <DatePickerModal
            title="Reminder"
            subtitle={r.title || undefined}
            value={isValidDateYYYYMMDD(r.date) ? r.date : todayYMD()}
            withTime
            timeRequired
            time={time}
            onPick={(date, t) => handleUpdateReminder(r.id, { date, time: t || time })}
            onClose={() => setPickerId(null)}
          />
        );
      })()}
      {daysModal ? createPortal(
        <div className="fixed inset-0 z-[10050] flex items-center justify-center">
          <button
            type="button"
            className={`absolute inset-0 ${classes.modalBackdrop}`}
            onClick={() => setDaysModal(null)}
            aria-label="Close"
          />
          <div
            role="dialog"
            aria-label="Repeat on"
            className={`relative w-[92vw] max-w-sm ${classes.modalCard}`}
          >
            <div className={classes.modalHeader}>
              <div className={classes.modalTitle}>Repeat on</div>
              <div className="mt-1 text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
                Pick the days this reminder repeats.
              </div>
            </div>

            <div className="flex justify-between gap-1.5 px-6 py-4" role="group" aria-label="Weekdays">
              {WEEK.map(d => {
                const on = daysModal.days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() =>
                      setDaysModal(m => m && {
                        ...m,
                        days: on ? m.days.filter(x => x !== d.value) : [...m.days, d.value],
                      })
                    }
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${on ? '' : classes.modalSecondaryButton}`}
                    style={on ? { background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' } : undefined}
                    aria-pressed={on}
                    aria-label={d.short}
                    data-tip={d.short}
                  >
                    {d.letter}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 px-6 text-[12px]">
              {[
                { label: 'Every day', days: ALL_DAYS },
                { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] },
                { label: 'Weekends', days: [6, 0] },
              ].map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDaysModal(m => m && { ...m, days: p.days })}
                  className={`rounded-full px-2.5 py-1 ${classes.modalSecondaryButton}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className={classes.modalFooter}>
              <button
                type="button"
                onClick={() => {
                  handleUpdateReminder(daysModal.id, { daily: false, days: undefined });
                  setDaysModal(null);
                }}
                className={`${classes.modalSecondaryButton} text-[13px] px-3 py-2 rounded-md`}
                data-tip="Don't repeat"
              >
                Once
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDaysModal(null)}
                  className={`${classes.modalSecondaryButton} text-[13px] px-3 py-2 rounded-md`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={daysModal.days.length === 0}
                  onClick={() => {
                    const days = ALL_DAYS.filter(d => daysModal.days.includes(d)).sort();
                    handleUpdateReminder(daysModal.id, { daily: true, days: days.length === 7 ? undefined : days });
                    setDaysModal(null);
                  }}
                  className="text-[13px] font-semibold px-3 py-2 rounded-md transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.querySelector('[data-assistant-root]') ?? document.body,
      ) : null}
    </>
  );

  if (variant === 'tab') {
    return <div className="flex h-full min-h-0 w-full min-w-0 flex-col">{body}</div>;
  }

  if (variant === 'dock') {
    return (
      <div
        className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        {body}
      </div>
    );
  }

  return (
    <>
      <button type="button" className="fixed inset-0 z-200" onClick={requestClose}
        aria-label="Close reminders"
        style={{ background: 'var(--assistant-overlay)', animation: isClosing ? 'remindersOverlayOut 0.2s ease-out both' : 'remindersOverlayIn 0.22s ease-out both' }}
      />
      <div
        className={`fixed right-3 top-3 z-201 flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl ${classes.panelGlass} ${classes.panelOverlay}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        <style>{`
          @keyframes remindersOverlayIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes remindersOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        `}</style>
        {body}
      </div>
    </>
  );
}
