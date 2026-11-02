'use client';

import React, { useEffect, useMemo, useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import { TaskCheckmark } from './TaskCheckmark';
import {
  type Project,
  LS_KEY_V2,
  readProjectsLS,
  taskCalendarDay,
  isUncTitleBlock,
  formatPill,
  weekdayLabel,
} from '@/lib/datacenter';

type DoneTask = { id: string; text: string; day: string; group: string; list: string };

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

function dayLabel(ymd: string) {
  return `${weekdayLabel(ymd)}, ${formatPill(ymd)}`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Every completed task, listed by the day it was finished (its completedAt). */
function collectDone(projects: Project[]): DoneTask[] {
  const out: DoneTask[] = [];
  for (const p of projects) {
    const blocks = p.blocks ?? [];
    const listTitle = new Map(blocks.filter(b => b.indent === 0).map(b => [
      b.id,
      isUncTitleBlock(b) ? '' : (b.text || '').trim(),
    ]));
    for (const b of blocks) {
      if (b.indent === 0 || b.checked !== true || b.archived === true) continue;
      const day = taskCalendarDay(b);
      if (!day || !(b.text || '').trim()) continue;
      out.push({
        id: b.id,
        text: b.text.trim(),
        day,
        group: p.title,
        list: listTitle.get(b.parentId ?? '') ?? '',
      });
    }
  }
  return out;
}

export default function CompletedReport() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const load = () => setProjects(readProjectsLS()?.projects ?? []);
    load();
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_V2) load(); };
    window.addEventListener('youtask_projects_updated', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Months that have completed tasks, newest first; each holds its days, newest first
  const months = useMemo(() => {
    const byMonth = new Map<string, Map<string, DoneTask[]>>();
    for (const t of collectDone(projects)) {
      const mk = t.day.slice(0, 7);
      if (!byMonth.has(mk)) byMonth.set(mk, new Map());
      const days = byMonth.get(mk)!;
      if (!days.has(t.day)) days.set(t.day, []);
      days.get(t.day)!.push(t);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, days]) => ({
        key,
        label: monthLabel(key),
        days: [...days.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([day, tasks]) => ({
            day,
            label: dayLabel(day),
            tasks: tasks.sort((a, b) => `${a.group} ${a.list}`.localeCompare(`${b.group} ${b.list}`)),
          })),
      }));
  }, [projects]);

  const [index, setIndex] = useState(0);
  const active = Math.min(index, Math.max(0, months.length - 1));
  const current = months[active];
  const total = current ? current.days.reduce((n, d) => n + d.tasks.length, 0) : 0;

  const where = (t: DoneTask) => [t.group, t.list].filter(Boolean).join(' › ');

  // Prints the month on its own page (new window), so the app's chrome stays out of it
  const print = () => {
    if (!current) return;
    const body = current.days.map(d => `
      <h2>${escapeHtml(d.label)} <span>· ${d.tasks.length} task${d.tasks.length === 1 ? '' : 's'}</span></h2>
      <ul>${d.tasks.map(t => `<li>${escapeHtml(t.text)}${where(t) ? ` <em>${escapeHtml(where(t))}</em>` : ''}</li>`).join('')}</ul>
    `).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Completed · ${escapeHtml(current.label)}</title>
      <style>
        body { font: 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; color: #111; margin: 32px; }
        h1 { font-size: 22px; margin: 0 0 4px; } .sub { color: #666; margin: 0 0 24px; }
        h2 { font-size: 15px; margin: 20px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        h2 span { color: #888; font-weight: 400; } ul { margin: 0; padding-left: 20px; }
        li { margin: 3px 0; } em { color: #888; font-style: normal; font-size: 12px; margin-left: 6px; }
      </style></head><body>
      <h1>Completed tasks — ${escapeHtml(current.label)}</h1>
      <p class="sub">${total} task${total === 1 ? '' : 's'} completed</p>
      ${body}
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <section aria-label="Completed tasks report">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium uppercase tracking-wide" style={{ color: 'var(--assistant-text-faint)' }}>
            Completed
          </h2>
          <div className="text-[24px] font-semibold leading-tight" style={{ color: 'var(--assistant-text)' }} aria-live="polite">
            {current ? current.label : 'Nothing completed yet'}
          </div>
          {current ? (
            <div className="text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>
              {total} task{total === 1 ? '' : 's'} completed
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={print}
            disabled={!current}
            className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] ${classes.panelBtn}`}
            data-tip="Print this month's report"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinejoin="round" d="M4.5 6V2h7v4M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7V14h-7z" />
            </svg>
            Print
          </button>
          {/* Older months are further back in the list → "previous" moves the index up */}
          <button
            type="button"
            onClick={() => setIndex(active + 1)}
            disabled={active >= months.length - 1}
            className={`flex h-9 w-9 items-center justify-center rounded-md ${classes.panelBtn}`}
            aria-label="Previous month"
            data-tip="Previous month"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3 4.5 8l5 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setIndex(active - 1)}
            disabled={active === 0}
            className={`flex h-9 w-9 items-center justify-center rounded-md ${classes.panelBtn}`}
            aria-label="Next month"
            data-tip="Next month"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </div>

      {current ? (
        <div className="space-y-5">
          {current.days.map(d => (
            <div key={d.day}>
              {/* Same type as Workspace: day = list header (14px semibold + rule), rows = task rows */}
              <div
                className="mb-1 flex items-baseline gap-2 py-1 text-[14px] md:text-sm font-semibold"
                style={{ color: 'var(--assistant-text)', borderBottom: '1px solid var(--assistant-border-soft)' }}
              >
                {d.label}
                <span className="text-[12px] font-medium tabular-nums" style={{ color: 'var(--assistant-text-faint)' }}>
                  ({d.tasks.length})
                </span>
              </div>
              <ul className="space-y-1">
                {d.tasks.map(t => (
                  <li key={t.id} className="flex items-start gap-2 px-0.5 py-1" style={{ paddingLeft: 8 }}>
                    <span className="flex h-[1.45em] w-4 shrink-0 items-center justify-center text-[14px] md:text-sm">
                      <TaskCheckmark checked />
                    </span>
                    <span
                      className="min-w-0 flex-1 break-words text-[14px] md:text-sm leading-[1.45]"
                      style={{ color: 'var(--assistant-text-soft)' }}
                    >
                      {t.text}
                    </span>
                    {where(t) ? (
                      <span className="shrink-0 pl-2 text-[12px] leading-[1.45rem]" style={{ color: 'var(--assistant-text-faint)' }}>
                        {where(t)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[14px]" style={{ color: 'var(--assistant-text-faint)' }}>
          Completed tasks will be listed here, by the day you finished them.
        </div>
      )}
    </section>
  );
}
