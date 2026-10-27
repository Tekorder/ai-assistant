'use client';
import React, { useMemo, useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import {
  type Block,
  type DateRange,
  type SortBy,
  getRangeLabel,
  getTaskFlag,
  isListVisible,
  isValidDateYYYYMMDD,
  formatPill,
  weekdayLabel,
} from '@/lib/datacenter';
import { TaskFlagIcon } from './TaskFlag';
import { TaskCheckmark } from './TaskCheckmark';

type RangeTask = { id: string; text: string; listTitle: string; checked: boolean; block: Block };

/**
 * Calendar "Select range" results: every task whose due or created date falls in
 * the range, grouped by that date. Due Date only counts tasks that have one.
 */
export function RangeTasksDialog({
  range,
  blocks,
  visibleLists,
  projectTitle,
  zIndex = 999,
  onChangeRange,
  onClose,
}: {
  range: DateRange;
  blocks: Block[];
  visibleLists: Record<string, boolean>;
  projectTitle: string;
  zIndex?: number;
  onChangeRange: () => void;
  onClose: () => void;
}) {
  const [by, setBy] = useState<SortBy>('dueDate');

  const days = useMemo(() => {
    const byDate: Record<string, RangeTask[]> = {};
    let listTitle = '';
    let listVisible = true;
    for (const b of blocks) {
      if (b.indent === 0) {
        listTitle = (b.text || '').trim();
        listVisible = isListVisible(visibleLists, b.id);
        continue;
      }
      if (b.indent !== 1 || b.section || !listVisible || b.archived) continue;
      const date = by === 'createdAt' ? b.createdAt : b.deadline;
      if (!isValidDateYYYYMMDD(date) || date < range.from || date > range.to) continue;
      (byDate[date] ??= []).push({
        id: b.id,
        text: b.text || '',
        listTitle: listTitle || projectTitle || 'General',
        checked: Boolean(b.checked),
        block: b,
      });
    }
    return Object.keys(byDate).sort().map(ymd => ({ ymd, tasks: byDate[ymd] }));
  }, [blocks, visibleLists, projectTitle, range, by]);

  const total = days.reduce((n, d) => n + d.tasks.length, 0);
  const done = days.reduce((n, d) => n + d.tasks.filter(t => t.checked).length, 0);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex }}>
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div
        role="dialog"
        aria-label="Tasks in range"
        className={`relative flex max-h-[85vh] w-[92vw] max-w-lg flex-col rounded-2xl shadow-2xl ${classes.quickModal}`}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>{getRangeLabel(range)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--assistant-text-faint)' }}>
            {total === 0 ? 'No tasks' : `${total} task${total === 1 ? '' : 's'} · ${done} done`}
          </div>
          <div className="flex gap-1.5 mt-3">
            {([['dueDate', 'Due Date'], ['createdAt', 'Created Date']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setBy(value)}
                className={`text-[12px] px-2.5 py-1 rounded-full ${by === value ? classes.quickFilterActive : classes.quickFilterInactive}`}
                aria-pressed={by === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {days.length === 0 ? (
            <div className="py-8 text-center text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>
              No tasks {by === 'createdAt' ? 'created' : 'due'} in this range
            </div>
          ) : (
            days.map(({ ymd, tasks }) => (
              <div key={ymd} className="mb-4 last:mb-0">
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-text-soft)' }}>
                  {weekdayLabel(ymd)}, {formatPill(ymd)}
                </div>
                <ul className="space-y-1">
                  {tasks.map(t => {
                    const flag = getTaskFlag(t.block);
                    return (
                      <li
                        key={t.id}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                        style={{ background: 'var(--assistant-control-bg)', border: '1px solid var(--assistant-border-soft)' }}
                      >
                        <span className="grid size-4 shrink-0 place-items-center" aria-label={t.checked ? 'Done' : 'Open'}>
                          <TaskCheckmark checked={Boolean(t.checked)} />
                        </span>
                        <span
                          className={`min-w-0 flex-1 break-words text-[13px] ${t.checked ? 'line-through opacity-60' : ''}`}
                          style={{ color: 'var(--assistant-text)' }}
                          title={t.text}
                        >
                          {t.text || 'Untitled'}
                        </span>
                        {flag && <TaskFlagIcon color={flag} className="h-3.5 w-3.5 shrink-0" />}
                        <span className="max-w-[40%] shrink-0 break-words text-[11px]" style={{ color: 'var(--assistant-text-faint)' }} title={t.listTitle}>
                          {t.listTitle}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
          <button type="button" onClick={onChangeRange} className={`text-[13px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}>
            Change range
          </button>
          <button type="button" onClick={onClose} className={`text-[13px] font-semibold px-3 py-2 rounded-md ${classes.quickModalPrimary}`}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
