'use client';

import React, { useMemo, useState } from 'react';
import { addDaysYMD, parseYMD, type Habit } from '@/lib/datacenter';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import {
  type DayStatus,
  type HabitLogIndex,
  dayStatus,
  eachDay,
  formatProgress,
  isGoalMet,
  periodBounds,
  periodTotal,
  shiftMonth,
} from '@/app/assistant/_utils/habitSchedule';
import {
  MONTH_SHORT,
  formatStreak,
  habitStreaks,
  isPerfectDay,
  isPerfectWeek,
  monthlyRate,
  overallRange,
  volume,
  yearRates,
} from '@/app/assistant/_utils/habitStats';
import classes from '@/app/assistant/_theme/themes.module.css';
import { Segmented, fmtPct } from '../dashboard/DashboardPieces';

type Range = 'week' | 'month' | 'year';
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Habits that are on during any part of [from, to]. */
const activeIn = (habits: Habit[], from: string, to: string) =>
  habits.filter(h => h.startDate <= to && (!h.endDate || h.endDate >= from));

/**
 * The tracker sheet: every habit against the days of a week or month (or the
 * months of a year), with perfect-week badges, best days and a summary.
 */
export function HabitTracker({ habits, index, today, onOpen }: {
  /** Not archived, already filtered by group */
  habits: Habit[];
  index: HabitLogIndex;
  today: string;
  onOpen: (habit: Habit, ymd?: string) => void;
}) {
  const [range, setRange] = useState<Range>('week');
  const [anchor, setAnchor] = useState(today);

  const bounds = range === 'year'
    ? { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` }
    : periodBounds(range, anchor);
  const shift = (dir: -1 | 1) => setAnchor(a =>
    range === 'week' ? addDaysYMD(a, dir * 7) : range === 'month' ? shiftMonth(a, dir) : `${Number(a.slice(0, 4)) + dir}-01-01`);
  const canNext = bounds.to < today;
  const shown = useMemo(() => activeIn(habits, bounds.from, bounds.to), [habits, bounds.from, bounds.to]);

  const label = range === 'year' ? anchor.slice(0, 4)
    : range === 'month' ? parseYMD(bounds.from).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${fmtShort(bounds.from)} – ${fmtShort(bounds.to)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented ariaLabel="Tracker range" value={range} onChange={r => { setRange(r); setAnchor(today); }}
          options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />
        <div className="flex items-center gap-1">
          <NavButton label="Previous" onClick={() => shift(-1)}>‹</NavButton>
          <span className="min-w-[150px] text-center text-[14px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{label}</span>
          <NavButton label="Next" onClick={() => shift(1)} disabled={!canNext}>›</NavButton>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-12 text-center text-[14px]" style={{ color: 'var(--assistant-text-faint)' }}>No habits in this period.</p>
      ) : range === 'week' ? (
        <WeekSheet habits={shown} index={index} today={today} monday={bounds.from} onOpen={onOpen} />
      ) : range === 'month' ? (
        <MonthSheet habits={shown} index={index} today={today} from={bounds.from} to={bounds.to} onOpen={onOpen} />
      ) : (
        <YearSheet habits={shown} index={index} today={today} year={Number(anchor.slice(0, 4))} onOpen={onOpen} />
      )}
    </div>
  );
}

const fmtShort = (ymd: string) => parseYMD(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function NavButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full ${classes.panelBtn}`}>{children}</button>
  );
}

/** The sheet's frame: a bordered, horizontally scrolling grid. */
function Sheet({ columns, children, minWidth }: { columns: string; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ contain: 'inline-size', background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}>
      <div role="table" className="grid items-center" style={{ gridTemplateColumns: columns, minWidth }}>{children}</div>
    </div>
  );
}

const cellBorder: React.CSSProperties = { borderTop: '1px solid var(--assistant-border-soft)' };

function NameCell({ habit, onOpen }: { habit: Habit; onOpen: () => void }) {
  return (
    <button type="button" role="rowheader" onClick={onOpen}
      className="sticky left-0 z-[1] flex h-full min-w-0 items-center gap-2 px-3 py-2 text-left text-[13px] font-medium hover:underline"
      style={{ ...cellBorder, color: 'var(--assistant-text)', background: 'var(--assistant-surface)' }}>
      <span aria-hidden="true">{habit.emoji || '✅'}</span>
      <span className="min-w-0 break-words">{habit.text}</span>
    </button>
  );
}

const STATUS_TEXT: Record<DayStatus, string> = {
  done: 'Done', partial: 'Partly done', missed: 'Missed', pending: 'Not done yet', skipped: 'Skipped', off: 'Not due', future: 'Upcoming',
};

/** A day square, colored by status in the habit's color (inside .yt-habit). */
function StatusSquare({ status, size, tip, onClick }: { status: DayStatus; size: number; tip: string; onClick?: () => void }) {
  const style: React.CSSProperties =
    status === 'done' ? { background: 'var(--habit-color)' }
    : status === 'partial' ? { background: 'color-mix(in srgb, var(--habit-color) 40%, transparent)' }
    : status === 'missed' ? { background: 'color-mix(in srgb, var(--assistant-danger-text) 18%, transparent)' }
    : status === 'pending' ? { boxShadow: 'inset 0 0 0 1.5px var(--habit-color)' }
    : status === 'skipped' ? { boxShadow: 'inset 0 0 0 1.5px var(--assistant-border-soft)', background: 'repeating-linear-gradient(135deg, transparent 0 3px, color-mix(in srgb, var(--assistant-text) 10%, transparent) 3px 5px)' }
    : { background: status === 'off' ? 'transparent' : 'color-mix(in srgb, var(--assistant-text) 5%, transparent)' };
  return (
    <button type="button" onClick={onClick} disabled={!onClick} data-tip={tip} aria-label={tip}
      className="mx-auto block rounded-md transition-transform enabled:hover:scale-110"
      style={{ width: size, height: size, ...style }} />
  );
}

function PerfectBadge() {
  return (
    <span className="mx-auto inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: 'var(--habit-tint-strong)', color: 'var(--habit-ink)' }} data-tip="Every due day done">
      👍 Perfect
    </span>
  );
}

function Summary({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(i => (
        <div key={i.label} className={`rounded-xl px-3 py-2.5 text-center ${classes.dashCard}`}>
          <div className="text-[22px] font-bold tabular-nums" style={{ color: 'var(--assistant-text)' }}>{i.value}</div>
          <div className="text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>{i.label}</div>
        </div>
      ))}
    </div>
  );
}

function WeekSheet({ habits, index, today, monday, onOpen }: {
  habits: Habit[]; index: HabitLogIndex; today: string; monday: string; onOpen: (h: Habit, ymd?: string) => void;
}) {
  const days = eachDay(monday, addDaysYMD(monday, 6));
  const sunday = days[6];
  const overall = useMemo(() => overallRange(habits, index, monday, sunday, today), [habits, index, monday, sunday, today]);
  const best = Math.max(0, ...habits.filter(h => h.goalPeriod === 'day').map(h => habitStreaks(h, index, today).best));

  return (
    <>
      <Sheet columns="minmax(140px, 1.6fr) repeat(7, minmax(36px, 1fr)) 88px" minWidth={560}>
        <div className="sticky left-0 z-[1] h-full" style={{ background: 'var(--assistant-surface)' }} />
        {days.map((d, i) => (
          <div key={d} role="columnheader" className="py-2 text-center text-[11px] font-semibold" style={{ color: d === today ? 'var(--assistant-text)' : 'var(--assistant-text-faint)' }}>
            <div>{LETTERS[i]}</div>
            <div className="text-[13px] tabular-nums">{Number(d.slice(8))}</div>
          </div>
        ))}
        <div />

        {habits.map(h => {
          const color = habitColorStyle(h.color);
          const perfect = isPerfectWeek(h, index, monday, today);
          return (
            <div key={h.id} role="row" className={`${color.className} contents`} style={color.style}>
              <NameCell habit={h} onOpen={() => onOpen(h)} />
              {h.goalPeriod === 'day' ? days.map(d => {
                const s = dayStatus(h, index, d, today);
                return (
                  <div key={d} role="cell" className={`${color.className} flex h-full items-center py-2`} style={{ ...color.style, ...cellBorder }}>
                    <StatusSquare status={s} size={26} tip={`${fmtShort(d)} · ${STATUS_TEXT[s]}`} onClick={d <= today ? () => onOpen(h, d) : undefined} />
                  </div>
                );
              }) : (
                <div role="cell" className={`${color.className} flex h-full items-center px-1 py-2`} style={{ ...color.style, ...cellBorder, gridColumn: 'span 7' }}>
                  <SpanBar habit={h} index={index} monday={monday} sunday={sunday} />
                </div>
              )}
              <div role="cell" className={`${color.className} flex h-full items-center justify-center`} style={{ ...color.style, ...cellBorder }}>
                {perfect ? <PerfectBadge /> : null}
              </div>
            </div>
          );
        })}

        <div role="rowheader" className="sticky left-0 z-[1] flex h-full items-center px-3 py-2 text-[12px] font-semibold"
          style={{ ...cellBorder, background: 'var(--assistant-surface)', color: 'var(--assistant-text-muted)' }}>
          Best days
        </div>
        {overall.days.map(d => (
          <div key={d.date} role="cell" className="flex h-full items-center justify-center py-2 text-[16px]" style={cellBorder}
            data-tip={d.due ? `${d.done} of ${d.due} done` : 'Nothing due'}>
            {isPerfectDay(d, today) ? '⭐' : ''}
          </div>
        ))}
        <div style={cellBorder} className="h-full" />
      </Sheet>
      <Summary items={[
        { label: 'Met this week', value: fmtPct(overall.rate) },
        { label: 'Perfect days', value: String(overall.perfectDays) },
        { label: 'Best daily streak', value: formatStreak(best, 'day') },
      ]} />
    </>
  );
}

/** Weekly / monthly goals in the week view: one bar across the days. */
function SpanBar({ habit, index, monday, sunday }: { habit: Habit; index: HabitLogIndex; monday: string; sunday: string }) {
  const weekly = habit.goalPeriod === 'week';
  const total = weekly ? periodTotal(habit, index, monday) : periodTotal(habit, index, sunday);
  const inWeek = volume(habit, index, monday, sunday);
  const met = isGoalMet(habit, total);
  const ratio = habit.kind === 'quit' ? (met ? 1 : 0) : habit.goalValue > 0 ? Math.min(1, total / habit.goalValue) : 1;
  const text = weekly
    ? formatProgress(total, habit.goalValue, habit.goalUnit)
    : `${formatProgress(total, habit.goalValue, habit.goalUnit)} this month · +${inWeek} this week`;
  return (
    <div className="relative h-7 w-full overflow-hidden rounded-full" style={{ background: 'var(--habit-tint)' }}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${ratio * 100}%`, background: met ? 'var(--habit-color)' : 'var(--habit-tint-strong)' }} />
      <span className="relative flex h-full items-center justify-center text-[12px] font-semibold tabular-nums"
        style={{ color: met && ratio > 0.5 ? 'var(--habit-on)' : 'var(--assistant-text)' }}>
        {text}
      </span>
    </div>
  );
}

function MonthSheet({ habits, index, today, from, to, onOpen }: {
  habits: Habit[]; index: HabitLogIndex; today: string; from: string; to: string; onOpen: (h: Habit, ymd?: string) => void;
}) {
  const days = eachDay(from, to);
  const overall = useMemo(() => overallRange(habits, index, from, to, today), [habits, index, from, to, today]);

  return (
    <>
      <Sheet columns={`minmax(140px, 1.6fr) repeat(${days.length}, 22px) 56px`} minWidth={140 + days.length * 22 + 56}>
        <div className="sticky left-0 z-[1] h-full" style={{ background: 'var(--assistant-surface)' }} />
        {days.map(d => (
          <div key={d} role="columnheader" className="py-2 text-center text-[10px] font-semibold tabular-nums"
            style={{ color: d === today ? 'var(--assistant-text)' : 'var(--assistant-text-faint)' }}>
            {Number(d.slice(8))}
          </div>
        ))}
        <div role="columnheader" className="py-2 text-center text-[11px] font-semibold" style={{ color: 'var(--assistant-text-faint)' }}>Rate</div>

        {habits.map(h => {
          const color = habitColorStyle(h.color);
          return (
            <div key={h.id} role="row" className="contents">
              <NameCell habit={h} onOpen={() => onOpen(h)} />
              {days.map(d => {
                const s = dayStatus(h, index, d, today);
                return (
                  <div key={d} role="cell" className={`${color.className} flex h-full items-center py-2`} style={{ ...color.style, ...cellBorder }}>
                    <StatusSquare status={s} size={16} tip={`${fmtShort(d)} · ${STATUS_TEXT[s]}`} onClick={d <= today ? () => onOpen(h, d) : undefined} />
                  </div>
                );
              })}
              <div role="cell" className="flex h-full items-center justify-center text-[12px] font-semibold tabular-nums"
                style={{ ...cellBorder, color: 'var(--assistant-text-soft)' }}>
                {fmtPct(monthlyRate(h, index, from, today))}
              </div>
            </div>
          );
        })}
      </Sheet>
      <Summary items={[
        { label: 'Met this month', value: fmtPct(overall.rate) },
        { label: 'Perfect days', value: String(overall.perfectDays) },
        { label: 'Best perfect run', value: formatStreak(overall.bestPerfectStreak, 'day') },
      ]} />
    </>
  );
}

function YearSheet({ habits, index, today, year, onOpen }: {
  habits: Habit[]; index: HabitLogIndex; today: string; year: number; onOpen: (h: Habit) => void;
}) {
  const rows = useMemo(() => habits.map(h => {
    const rates = yearRates(h, index, year, today);
    const known = rates.filter((r): r is number => r != null);
    return { habit: h, rates, avg: known.length ? known.reduce((a, b) => a + b, 0) / known.length : null };
  }), [habits, index, year, today]);

  return (
    <Sheet columns="minmax(140px, 1.6fr) repeat(12, minmax(40px, 1fr)) 56px" minWidth={140 + 12 * 40 + 56}>
      <div className="sticky left-0 z-[1] h-full" style={{ background: 'var(--assistant-surface)' }} />
      {MONTH_SHORT.map(m => (
        <div key={m} role="columnheader" className="py-2 text-center text-[11px] font-semibold" style={{ color: 'var(--assistant-text-faint)' }}>{m}</div>
      ))}
      <div role="columnheader" className="py-2 text-center text-[11px] font-semibold" style={{ color: 'var(--assistant-text-faint)' }}>Avg</div>

      {rows.map(({ habit: h, rates, avg }) => {
        const color = habitColorStyle(h.color);
        return (
          <div key={h.id} role="row" className="contents">
            <NameCell habit={h} onOpen={() => onOpen(h)} />
            {rates.map((r, m) => (
              <div key={m} role="cell" className={`${color.className} flex h-full items-center justify-center px-0.5 py-2`} style={{ ...color.style, ...cellBorder }}>
                <span className="flex h-7 w-full items-center justify-center rounded-md text-[11px] font-semibold tabular-nums"
                  data-tip={`${MONTH_SHORT[m]} ${year} · ${r == null ? 'no data' : `${Math.round(r * 100)}% success`}`}
                  style={r == null
                    ? { color: 'var(--assistant-text-faint)' }
                    : {
                      background: `color-mix(in srgb, var(--habit-color) ${Math.round(12 + r * 88)}%, transparent)`,
                      color: r > 0.55 ? 'var(--habit-on)' : 'var(--assistant-text)',
                    }}>
                  {r == null ? '–' : Math.round(r * 100)}
                </span>
              </div>
            ))}
            <div role="cell" className="flex h-full items-center justify-center text-[12px] font-semibold tabular-nums"
              style={{ ...cellBorder, color: 'var(--assistant-text-soft)' }}>
              {fmtPct(avg)}
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}
