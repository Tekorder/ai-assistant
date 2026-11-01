'use client';

import React, { useRef, useState } from 'react';
import { arrayMove, readHabitsLS, upsertHabitLS, writeHabitsLS, type Habit } from '@/lib/datacenter';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { goalSentence } from '@/app/assistant/_utils/habitSchedule';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitModal } from './HabitModal';

/**
 * Every habit in one place: drag to reorder (the order Today and the tracker use),
 * edit, archive / restore, delete. Archived habits keep their history.
 */
export function HabitManager({ habits, onClose, onOpen, onEdit, onDelete }: {
  habits: Habit[];
  onClose: () => void;
  onOpen: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const active = habits.filter(h => !h.archived);
  const archived = habits.filter(h => h.archived);
  const drag = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (overId: string) => {
    const from = habits.findIndex(h => h.id === drag.current);
    const to = habits.findIndex(h => h.id === overId);
    drag.current = null;
    setOver(null);
    if (from < 0 || to < 0 || from === to) return;
    writeHabitsLS({ ...readHabitsLS(), habits: arrayMove(habits, from, to) });
  };

  const row = (h: Habit) => {
    const color = habitColorStyle(h.color);
    return (
      <li
        key={h.id}
        draggable={!h.archived}
        onDragStart={e => { drag.current = h.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', h.id); } catch {} }}
        onDragOver={e => { if (drag.current) { e.preventDefault(); setOver(h.id); } }}
        onDrop={e => { e.preventDefault(); drop(h.id); }}
        onDragEnd={() => { drag.current = null; setOver(null); }}
        className={`${color.className} group flex items-center gap-2 rounded-xl px-2 py-2 ${over === h.id && drag.current !== h.id ? classes.dragOver : ''}`}
        style={{ ...color.style, background: 'var(--habit-tint)', opacity: h.archived ? 0.7 : 1 }}
      >
        {!h.archived ? (
          <span className={`w-3 shrink-0 cursor-grab select-none ${classes.dragHandle}`} data-tip="Drag to reorder" aria-hidden="true">
            <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor">
              <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
              <circle cx="2" cy="6.5" r="1.2" /><circle cx="6" cy="6.5" r="1.2" />
              <circle cx="2" cy="11" r="1.2" /><circle cx="6" cy="11" r="1.2" />
            </svg>
          </span>
        ) : <span className="w-3 shrink-0" />}
        <button type="button" onClick={() => onOpen(h)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="text-[20px]" aria-hidden="true">{h.emoji || '✅'}</span>
          <span className="min-w-0">
            <span className="block break-words text-[14px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{h.text}</span>
            <span className="block text-[12px]" style={{ color: 'var(--habit-ink)' }}>
              {goalSentence(h)}{h.group ? ` · ${h.group}` : ''}
            </span>
          </span>
        </button>
        <RowButton label={`Edit ${h.text}`} onClick={() => onEdit(h)}>✎</RowButton>
        <RowButton label={h.archived ? `Restore ${h.text}` : `Archive ${h.text}`} onClick={() => upsertHabitLS({ ...h, archived: !h.archived })}>
          {h.archived ? '↩' : '🗄'}
        </RowButton>
        <RowButton label={`Delete ${h.text}`} onClick={() => onDelete(h)} danger>✕</RowButton>
      </li>
    );
  };

  return (
    <HabitModal title="Manage habits" onClose={onClose} width="max-w-lg">
      {habits.length === 0 ? (
        <p className="py-10 text-center text-[14px]" style={{ color: 'var(--assistant-text-faint)' }}>No habits yet.</p>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-1.5" aria-label="Habits">{active.map(row)}</ul>
          {archived.length ? (
            <section>
              <h3 className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-text-faint)' }}>
                Archived · {archived.length}
              </h3>
              <ul className="space-y-1.5" aria-label="Archived habits">{archived.map(row)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </HabitModal>
  );
}

function RowButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} data-tip={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] transition-colors hover:bg-[var(--assistant-hover-bg)]"
      style={{ color: danger ? 'var(--assistant-danger-text)' : 'var(--assistant-text-muted)' }}>
      {children}
    </button>
  );
}
