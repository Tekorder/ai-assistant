'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  type ReminderItem,
  LS_KEY_REMINDERS,
  arrayMove,
  isValidDateYYYYMMDD,
  isValidTimeHHMM,
  todayYMD,
  makeDefaultReminder,
  ensureOneReminder,
  readRemindersLS,
  writeRemindersLS,
  insertReminderAfter as insertReminderAfterArr,
  removeReminder as removeReminderArr,
  updateReminder as updateReminderArr,
} from '@/lib/datacenter';
import { TaskFlagButton } from './TaskFlag';
import classes from '@/app/assistant/_theme/themes.module.css';

function formatDateUS(date?: string) {
  if (!date || !isValidDateYYYYMMDD(date)) return '—';
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(dt);
}

function formatTimeUS(time?: string) {
  const safe = isValidTimeHHMM(time) ? time : '11:00';
  const [hh, mm] = safe.split(':').map(Number);
  const dt = new Date();
  dt.setHours(hh || 0, mm || 0, 0, 0);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dt);
}

function formatReminderDateTimeUS(date?: string, time?: string) {
  return `${formatDateUS(date)} · ${formatTimeUS(time)}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  variant?: 'overlay' | 'dock';
};

export default function RemindersPanel({ open, onClose, variant = 'overlay' }: Props) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([makeDefaultReminder()]);
  const reminderTitleRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [newId, setNewId] = useState<string | null>(null);
  const newTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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

  const handleReminderKey = (e: React.KeyboardEvent<HTMLInputElement>, r: ReminderItem) => {
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

      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Reminders</h2>
        <button type="button" onClick={requestClose}
          className={`h-8 w-8 rounded-lg ${classes.panelBtn}`} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="px-4 py-3 shrink-0 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <span className="text-[10px]" style={{ color: 'var(--assistant-text-faint)' }}>
          US format: MM/DD/YYYY · h:mm AM/PM
        </span>
        <button type="button" onClick={handleAddReminder}
          className={`h-8 w-8 shrink-0 rounded-md ${classes.panelBtn}`} title="New reminder">
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-1">
          {reminders.map((r, idx) => {
            const isDraggingOver = dragOverId === r.id && dragRef.current?.id !== r.id;
            const isDraggingMe = dragRef.current?.id === r.id;
            return (
              <div
                key={r.id}
                draggable
                onDragStart={e => onDragStartRow(e, r.id, idx)}
                onDragOver={e => onDragOverRow(e, r.id)}
                onDrop={e => onDropRow(e, r.id)}
                onDragEnd={onDragEndRow}
                className={[
                  'group flex flex-col gap-1 px-0.5 py-1 rounded-md',
                  isDraggingOver ? classes.dragOver : '',
                  isDraggingMe ? 'opacity-60' : '',
                  newId === r.id ? 'wadu-line-in' : '',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className={`w-3 shrink-0 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing ${classes.dragHandle}`} title="Drag">
                    <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor" aria-hidden="true">
                      <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                      <circle cx="2" cy="6.5" r="1.2"/><circle cx="6" cy="6.5" r="1.2"/>
                      <circle cx="2" cy="11" r="1.2"/><circle cx="6" cy="11" r="1.2"/>
                    </svg>
                  </div>

                  <TaskFlagButton
                    source={r}
                    onChange={(next) => handleUpdateReminder(r.id, { flag: next, priority: undefined })}
                  />

                  <input
                    ref={el => void (reminderTitleRefs.current[r.id] = el)}
                    value={r.title}
                    placeholder="Reminder…"
                    onChange={e => handleUpdateReminder(r.id, { title: e.target.value })}
                    onKeyDown={e => handleReminderKey(e, r)}
                    className="min-w-30 flex-1 bg-transparent outline-none text-sm cursor-pointer"
                    style={{ color: 'var(--assistant-text-soft)' }}
                  />

                  <input
                    type="date"
                    value={isValidDateYYYYMMDD(r.date) ? r.date : todayYMD()}
                    onChange={e => {
                      const v = e.target.value;
                      handleUpdateReminder(r.id, { date: isValidDateYYYYMMDD(v) ? v : todayYMD() });
                    }}
                    className={`shrink-0 text-[11px] px-2 py-1 rounded-md ${classes.panelInput}`}
                  />

                  <input
                    type="time"
                    value={isValidTimeHHMM(r.time) ? r.time : '11:00'}
                    onChange={e => {
                      const v = e.target.value;
                      handleUpdateReminder(r.id, { time: isValidTimeHHMM(v) ? v : '11:00' });
                    }}
                    className={`shrink-0 text-[11px] px-2 py-1 rounded-md ${classes.panelInput}`}
                  />

                  <button
                    type="button"
                    onClick={() => handleUpdateReminder(r.id, { daily: !r.daily })}
                    className={`shrink-0 text-[11px] px-2 py-1 rounded-full ${r.daily ? classes.panelAccentBadge : classes.panelNeutralBadge}`}
                  >
                    {r.daily ? 'Daily' : 'Once'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemoveReminder(r.id)}
                    className={`h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 ${classes.panelBtn}`}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>

                <div className="pl-5 text-[10px]" style={{ color: 'var(--assistant-text-faint)' }}>
                  {formatReminderDateTimeUS(
                    isValidDateYYYYMMDD(r.date) ? r.date : todayYMD(),
                    isValidTimeHHMM(r.time) ? r.time : '11:00',
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

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
        className={`fixed right-3 top-3 z-201 flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
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
