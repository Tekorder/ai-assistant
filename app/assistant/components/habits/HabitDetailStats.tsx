'use client';

import React, { useMemo, useState } from 'react';
import { formatPill, type Habit } from '@/lib/datacenter';
import { type HabitLogIndex, formatAmount, periodBounds } from '@/app/assistant/_utils/habitSchedule';
import {
  type TrendRange,
  comparisonSeries,
  dailyAverage,
  formatStreak,
  habitMemos,
  habitStreaks,
  monthlyRate,
  successCount,
  trendSeries,
  volume,
} from '@/app/assistant/_utils/habitStats';
import { Card, Empty, KpiTile, Segmented, fmtNum, fmtPct } from '../dashboard/DashboardPieces';
import { BarChart } from '../dashboard/BarChart';
import { LineChart } from '../dashboard/LineChart';

const RANGES: { value: TrendRange; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const MEMOS_SHOWN = 5;

/** The numbers under a habit's calendar: KPIs, memos, trend and this-vs-last comparison. */
export function HabitDetailStats({ habit, index, today, month }: {
  habit: Habit;
  index: HabitLogIndex;
  today: string;
  /** Month the "this month" tiles describe (the calendar's month) */
  month: string;
}) {
  const [trend, setTrend] = useState<TrendRange>('week');
  const [compare, setCompare] = useState<TrendRange>('week');
  const [allMemos, setAllMemos] = useState(false);

  const stats = useMemo(() => {
    const { from, to } = periodBounds('month', month);
    return {
      streaks: habitStreaks(habit, index, today),
      monthSuccess: successCount(habit, index, today, from, to),
      totalSuccess: successCount(habit, index, today),
      monthVolume: volume(habit, index, from, to),
      totalVolume: volume(habit, index),
      average: dailyAverage(habit, index),
      rate: monthlyRate(habit, index, month, today),
      memos: habitMemos(habit, index),
    };
  }, [habit, index, today, month]);

  const monthName = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'long' });
  const unit = habit.goalUnit;
  const per = habit.goalPeriod;
  const successUnit = per === 'day' ? 'days' : `${per}s`;
  const amount = (v: number) => formatAmount(Math.round(v * 100) / 100, unit);
  // Tiles: the number big, the unit underneath (long amounts would wrap)
  const tileNum = (v: number) => fmtNum(v, v >= 100 ? 0 : 2);

  const tiles = [
    { icon: '📅', label: `Successes in ${monthName}`, value: `${stats.monthSuccess}`, sub: successUnit },
    { icon: '✅', label: 'Total successes', value: `${stats.totalSuccess}`, sub: successUnit },
    { icon: '🔥', label: 'Current streak', value: formatStreak(stats.streaks.current, stats.streaks.unit) },
    { icon: '🏅', label: 'Best streak', value: formatStreak(stats.streaks.best, stats.streaks.unit) },
    { icon: '📊', label: `Logged in ${monthName}`, value: tileNum(stats.monthVolume), sub: unit },
    { icon: '📈', label: 'Logged in total', value: tileNum(stats.totalVolume), sub: unit },
    { icon: '⚖️', label: 'Average per active day', value: tileNum(stats.average), sub: unit },
    { icon: '🎯', label: `${monthName} success rate`, value: fmtPct(stats.rate) },
  ];

  const series = trendSeries(habit, index, trend, today);
  const goalLine = trend !== 'year' && per === 'day' && habit.kind === 'build'
    ? { value: habit.goalValue, label: `Goal ${fmtNum(habit.goalValue, 2)}` } : undefined;
  const Chart = habit.chartType === 'line' ? LineChart : BarChart;
  const cmp = comparisonSeries(habit, index, compare, today);
  const memos = allMemos ? stats.memos : stats.memos.slice(0, MEMOS_SHOWN);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(t => (
          <KpiTile key={t.label} icon={t.icon} label={t.label} value={t.value}
            sub={t.sub ? <span style={{ color: 'var(--assistant-text-faint)' }}>{t.sub}</span> : undefined} />
        ))}
      </div>

      <Card title="Memos" aside={stats.memos.length > MEMOS_SHOWN ? (
        <button type="button" onClick={() => setAllMemos(v => !v)} className="underline">{allMemos ? 'Show less' : `All ${stats.memos.length}`}</button>
      ) : undefined}>
        {memos.length ? (
          <ul className="space-y-2.5">
            {memos.map(m => (
              <li key={m.date} className="text-[13px]">
                <div className="text-[11px] font-medium" style={{ color: 'var(--habit-ink)' }}>{formatPill(m.date)}</div>
                <div className="whitespace-pre-wrap break-words" style={{ color: 'var(--assistant-text-soft)' }}>{m.memo}</div>
              </li>
            ))}
          </ul>
        ) : <Empty text="No memos yet." />}
      </Card>

      <Card title="Trending" aside={<Segmented ariaLabel="Trending range" value={trend} options={RANGES} onChange={setTrend} />}>
        <Chart
          values={series.values}
          xLabel={i => series.labels[i]}
          tickEvery={trend === 'month' ? 5 : 1}
          tooltip={i => `${trend === 'year' ? series.labels[i] : formatPill(series.dates[i])}: ${amount(series.values[i])}`}
          ariaLabel={`${habit.text}, amount per ${trend === 'year' ? 'month' : 'day'}`}
          color="var(--habit-color)"
          goal={goalLine}
        />
      </Card>

      <Card title="Comparison" aside={<Segmented ariaLabel="Comparison range" value={compare} options={RANGES} onChange={setCompare} />}>
        <BarChart
          values={cmp.current}
          compare={cmp.previous}
          xLabel={i => cmp.labels[i]}
          tickEvery={compare === 'month' ? 5 : 1}
          tooltip={i => `${cmp.labels[i]} · ${cmp.currentLabel}: ${amount(cmp.current[i])} · ${cmp.previousLabel}: ${amount(cmp.previous[i])}`}
          ariaLabel={`${habit.text}: ${cmp.currentLabel} compared with ${cmp.previousLabel}`}
          color="var(--habit-color)"
        />
        <div className="mt-2 flex gap-4 text-[12px]" style={{ color: 'var(--assistant-text-soft)' }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'color-mix(in srgb, var(--assistant-text-faint) 45%, transparent)' }} />
            {cmp.previousLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--habit-color)' }} />
            {cmp.currentLabel}
          </span>
        </div>
      </Card>
    </div>
  );
}
