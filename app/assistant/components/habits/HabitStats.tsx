'use client';

import React, { useMemo, useState } from 'react';
import { formatPill, type Habit } from '@/lib/datacenter';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { type HabitLogIndex, monthGrid, mondayIndex, shiftMonth } from '@/app/assistant/_utils/habitSchedule';
import { WEEK_SHORT, formatStreak, monthlyRate, overallMonth } from '@/app/assistant/_utils/habitStats';
import classes from '@/app/assistant/_theme/themes.module.css';
import { Card, Empty, KpiTile, fmtNum, fmtPct } from '../dashboard/DashboardPieces';
import { BarChart } from '../dashboard/BarChart';
import { ProgressRing } from '../dashboard/ProgressRing';
import { MonthStatusCalendar } from './HabitCalendars';
import { HabitDetailStats } from './HabitDetailStats';

const OVERALL = '__overall__';
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Stats across habits: "Overall" (every habit together — month rings, success
 * rate, perfect days, charts, per-habit rates) or one habit's own numbers.
 */
export function HabitStats({ habits, index, today, onOpen }: {
  /** Not archived, already filtered by group */
  habits: Habit[];
  index: HabitLogIndex;
  today: string;
  onOpen: (habit: Habit, ymd?: string) => void;
}) {
  const [pick, setPick] = useState(OVERALL);
  const [month, setMonth] = useState(today);
  const single = habits.find(h => h.id === pick);

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" style={{ contain: 'inline-size' }} role="radiogroup" aria-label="Habit">
        <Chip active={!single} onClick={() => setPick(OVERALL)}>📊 Overall</Chip>
        {habits.map(h => (
          <Chip key={h.id} active={single?.id === h.id} onClick={() => setPick(h.id)}>{h.emoji || '✅'} {h.text}</Chip>
        ))}
      </div>
      {single ? (
        <SingleHabit habit={single} index={index} today={today} month={month} setMonth={setMonth} onOpen={onOpen} />
      ) : (
        <Overall habits={habits} index={index} today={today} month={month} setMonth={setMonth} onPick={setPick} />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] ${active ? classes.quickFilterActive : classes.quickFilterInactive}`}>
      {children}
    </button>
  );
}

function MonthNav({ month, setMonth, today }: { month: string; setMonth: (m: string) => void; today: string }) {
  const [y, m] = month.split('-').map(Number);
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"
        className={`flex h-7 w-7 items-center justify-center rounded-full ${classes.panelBtn}`}>‹</button>
      <span className="min-w-[120px] text-center text-[13px] font-semibold" style={{ color: 'var(--assistant-text)' }}>
        {new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </span>
      <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={shiftMonth(month, 1) > today} aria-label="Next month"
        className={`flex h-7 w-7 items-center justify-center rounded-full ${classes.panelBtn}`}>›</button>
    </div>
  );
}

function SingleHabit({ habit, index, today, month, setMonth, onOpen }: {
  habit: Habit; index: HabitLogIndex; today: string; month: string; setMonth: (m: string) => void; onOpen: (h: Habit, ymd?: string) => void;
}) {
  const color = habitColorStyle(habit.color);
  return (
    <div className={`${color.className} space-y-3`} style={color.style}>
      <Card title="Calendar" aside={<button type="button" className="underline" onClick={() => onOpen(habit)}>Open habit</button>}>
        <MonthStatusCalendar habit={habit} index={index} month={month} onMonth={setMonth} today={today}
          selected="" onSelect={d => onOpen(habit, d)} />
      </Card>
      <HabitDetailStats habit={habit} index={index} today={today} month={month} />
    </div>
  );
}

function Overall({ habits, index, today, month, setMonth, onPick }: {
  habits: Habit[]; index: HabitLogIndex; today: string; month: string; setMonth: (m: string) => void; onPick: (id: string) => void;
}) {
  const o = useMemo(() => overallMonth(habits, index, month, today), [habits, index, month, today]);
  const byHabit = useMemo(() => habits
    .map(h => ({ habit: h, rate: monthlyRate(h, index, month, today) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)), [habits, index, month, today]);
  const weekday = useMemo(() => {
    const out = [0, 0, 0, 0, 0, 0, 0];
    for (const d of o.days) out[mondayIndex(d.date)] += d.done;
    return out;
  }, [o]);
  const byDate = new Map(o.days.map(d => [d.date, d]));
  const elapsed = o.days.filter(d => d.date <= today).length;
  const monthName = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'long' });

  if (!habits.length) return <Empty text="No habits to show yet." />;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <Card title="Every day" aside={<MonthNav month={month} setMonth={setMonth} today={today} />}>
          <div className="grid grid-cols-7 gap-1 text-center">
            {LETTERS.map((l, i) => <div key={i} className="pb-1 text-[11px] font-semibold" style={{ color: 'var(--assistant-text-faint)' }}>{l}</div>)}
            {monthGrid(month).map((d, i) => {
              if (!d) return <div key={`pad${i}`} />;
              const c = byDate.get(d)!;
              const future = d > today;
              return (
                <div key={d} className="flex justify-center" data-tip={`${formatPill(d)} · ${future ? 'upcoming' : c.due ? `${c.done} of ${c.due} done` : 'nothing due'}`}>
                  <ProgressRing value={c.due ? c.done / c.due : 0} size={36} stroke={3} color="var(--assistant-contrast-bg)">
                    <span className="text-[12px] font-medium tabular-nums"
                      style={{ color: future ? 'var(--assistant-text-faint)' : d === today ? 'var(--assistant-text)' : 'var(--assistant-text-soft)' }}>
                      {Number(d.slice(8))}
                    </span>
                  </ProgressRing>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title={`${monthName} success`}>
          <div className="flex flex-col items-center gap-3 py-2">
            <ProgressRing value={o.rate ?? 0} size={150} stroke={12} color="var(--assistant-contrast-bg)" ariaLabel={`Success rate ${fmtPct(o.rate)}`}>
              <span className="text-[32px] font-bold tabular-nums" style={{ color: 'var(--assistant-text)' }}>{fmtPct(o.rate)}</span>
              <span className="text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>check-ins done</span>
            </ProgressRing>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile icon="🏅" label="Best perfect run" value={formatStreak(o.bestPerfectStreak, 'day')} />
        <KpiTile icon="⭐" label="Perfect days" value={String(o.perfectDays)} sub={<span style={{ color: 'var(--assistant-text-faint)' }}>of {elapsed} so far</span>} />
        <KpiTile icon="✅" label="Habits done" value={String(o.habitsDone)} sub={<span style={{ color: 'var(--assistant-text-faint)' }}>check-ins</span>} />
        <KpiTile icon="📈" label="Daily average" value={fmtNum(o.dailyAverage, 1)} sub={<span style={{ color: 'var(--assistant-text-faint)' }}>done per day</span>} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Done per day">
          <BarChart values={o.days.map(d => d.done)} xLabel={i => String(i + 1)} tickEvery={7}
            mutedFrom={o.days.findIndex(d => d.date > today) === -1 ? undefined : o.days.findIndex(d => d.date > today)}
            tooltip={i => `${formatPill(o.days[i].date)}: ${o.days[i].done} of ${o.days[i].due} done`}
            ariaLabel={`Habits done per day in ${monthName}`} />
        </Card>
        <Card title="Done by weekday">
          <BarChart values={weekday} xLabel={i => WEEK_SHORT[i]} tooltip={i => `${WEEK_SHORT[i]}: ${weekday[i]} done`}
            ariaLabel={`Habits done by weekday in ${monthName}`} />
        </Card>
      </div>

      <Card title="By habit" aside={`${monthName} success rate`}>
        <ul className="space-y-2.5">
          {byHabit.map(({ habit: h, rate }) => {
            const color = habitColorStyle(h.color);
            return (
              <li key={h.id} className={color.className} style={color.style}>
                <button type="button" onClick={() => onPick(h.id)} className="w-full text-left">
                  <div className="mb-1 flex items-baseline gap-2 text-[13px]">
                    <span aria-hidden="true">{h.emoji || '✅'}</span>
                    <span className="min-w-0 flex-1 break-words font-medium" style={{ color: 'var(--assistant-text)' }}>{h.text}</span>
                    <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--assistant-text-soft)' }}>{fmtPct(rate)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--habit-tint)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(rate ?? 0) * 100}%`, background: 'var(--habit-color)' }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
