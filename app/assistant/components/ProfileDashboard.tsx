'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type Project,
  type ReminderItem,
  type TaskFlagColor,
  LS_KEY_V2,
  LS_KEY_REMINDERS,
  readProjectsLS,
  readRemindersLS,
} from '@/lib/datacenter';
import {
  type MonthStats,
  type BreakdownRow,
  collectTasks,
  computeMonthStats,
  monthRange,
} from '../_utils/profileStats';
import { TaskFlagIcon } from './TaskFlag';
import classes from '@/app/assistant/_theme/themes.module.css';

/* Status colors (fixed, never themed) — always shown with a text label */
const STATUS = {
  overdue: '#d03b3b',
  onHold: '#fab219',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fmtPct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fmtNum = (v: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v);

/* ───────────────────────── Data ───────────────────────── */

function useDashboardData() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);

  useEffect(() => {
    const loadProjects = () => setProjects(readProjectsLS()?.projects ?? []);
    const loadReminders = () => setReminders(readRemindersLS().reminders);
    loadProjects();
    loadReminders();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_V2) loadProjects();
      if (e.key === LS_KEY_REMINDERS) loadReminders();
    };
    window.addEventListener('youtask_projects_updated', loadProjects);
    window.addEventListener('youtask_reminders_updated', loadReminders);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', loadProjects);
      window.removeEventListener('youtask_reminders_updated', loadReminders);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return useMemo(() => {
    const tasks = collectTasks(projects);
    const months = monthRange(tasks);
    const stats = months.map(m => computeMonthStats(tasks, reminders, m));
    return { stats };
  }, [projects, reminders]);
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ───────────────────────── Pieces ───────────────────────── */

function Card({ title, aside, children, className = '' }: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl p-4 ${className}`}
      style={{ background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium" style={{ color: 'var(--assistant-text-muted)' }}>{title}</h3>
        {aside ? <div className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Delta({ value, prev, kind = 'count', invert = false, prevLabel }: {
  value: number | null;
  prev: number | null;
  kind?: 'count' | 'pct';
  /** true when going down is the good direction (e.g. overdue) */
  invert?: boolean;
  prevLabel: string;
}) {
  if (value == null || prev == null) {
    return <span style={{ color: 'var(--assistant-text-faint)' }}>No data for {prevLabel}</span>;
  }
  const diff = value - prev;
  if (diff === 0) return <span style={{ color: 'var(--assistant-text-faint)' }}>Same as {prevLabel}</span>;
  const up = diff > 0;
  const good = invert ? !up : up;
  const amount = kind === 'pct' ? `${Math.abs(Math.round(diff * 100))} pts` : fmtNum(Math.abs(diff));
  return (
    <span style={{ color: 'var(--assistant-text-soft)' }}>
      <span
        aria-hidden="true"
        style={{ color: good ? 'var(--assistant-accent)' : 'var(--assistant-danger-text, #d03b3b)' }}
      >
        {up ? '▲' : '▼'}
      </span>{' '}
      {amount} vs {prevLabel}
    </span>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-xl px-4 py-3.5"
      style={{ background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}
    >
      <div className="truncate text-[12px] font-medium" style={{ color: 'var(--assistant-text-muted)' }}>{label}</div>
      <div className="text-[28px] font-semibold leading-tight" style={{ color: 'var(--assistant-text)' }}>{value}</div>
      {sub ? <div className="truncate text-[12px]">{sub}</div> : null}
    </div>
  );
}

/** Rounded top corners only — the data end is rounded, the baseline end stays square. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function niceTop(max: number) {
  if (max <= 4) return Math.max(1, max);
  const step = Math.ceil(max / 4);
  return step * 4;
}

function BarChart({ values, xLabel, tickEvery = 1, tooltip, height = 180, ariaLabel, mutedFrom }: {
  values: number[];
  xLabel: (i: number) => string;
  tickEvery?: number;
  tooltip: (i: number) => string;
  height?: number;
  ariaLabel: string;
  /** Indices >= this are in the future (drawn as empty slots) */
  mutedFrom?: number;
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // top leaves room for the peak's direct label above the tallest bar
  const PAD = { top: 22, right: 12, bottom: 24, left: 32 };
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const top = niceTop(Math.max(0, ...values));
  const ticks = top <= 4 ? Array.from({ length: top + 1 }, (_, i) => i) : [0, top / 4, top / 2, (top * 3) / 4, top];
  const band = values.length ? innerW / values.length : 0;
  const barW = Math.max(2, Math.min(band - 2, 36));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const maxIdx = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
          {ticks.map(t => (
            <g key={t}>
              <line
                x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
                style={{ stroke: 'var(--assistant-border-soft)' }}
                strokeWidth={1}
                opacity={t === 0 ? 1 : 0.6}
              />
              <text
                x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11}
                style={{ fill: 'var(--assistant-text-faint)', fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtNum(t)}
              </text>
            </g>
          ))}

          {values.map((v, i) => {
            const cx = PAD.left + band * i + band / 2;
            const future = mutedFrom != null && i >= mutedFrom;
            const h = (v / top) * innerH;
            return (
              <g key={i}>
                {v > 0 ? (
                  <path
                    d={barPath(cx - barW / 2, y(v), barW, h)}
                    style={{ fill: 'var(--assistant-accent)' }}
                    opacity={hover == null || hover === i ? 1 : 0.4}
                  />
                ) : null}
                {/* Direct label on the peak only */}
                {i === maxIdx && v > 0 && hover == null ? (
                  <text
                    x={cx} y={y(v) - 6} textAnchor="middle" fontSize={11} fontWeight={600}
                    style={{ fill: 'var(--assistant-text-soft)' }}
                  >
                    {fmtNum(v)}
                  </text>
                ) : null}
                {i % tickEvery === 0 ? (
                  <text
                    x={cx} y={height - 6} textAnchor="middle" fontSize={11}
                    style={{ fill: future ? 'var(--assistant-text-faint)' : 'var(--assistant-text-muted)', opacity: future ? 0.5 : 1 }}
                  >
                    {xLabel(i)}
                  </text>
                ) : null}
                <rect
                  x={PAD.left + band * i} y={PAD.top} width={band} height={innerH}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(h0 => (h0 === i ? null : h0))}
                />
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {hover != null && width > 0 ? (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] shadow-lg"
          style={{
            left: Math.min(Math.max(PAD.left + band * hover + band / 2, 60), width - 60),
            top: Math.max(0, y(values[hover]) - 44),
            transform: 'translateX(-50%)',
            background: 'var(--assistant-panel-bg)',
            border: '1px solid var(--assistant-border-soft)',
            color: 'var(--assistant-text)',
          }}
        >
          {tooltip(hover)}
        </div>
      ) : null}
    </div>
  );
}

function StatusBar({ s }: { s: MonthStats }) {
  const segments = [
    { key: 'done', label: 'Completed', value: s.completed, color: 'var(--assistant-accent)' },
    { key: 'pending', label: 'Pending', value: s.pending, color: 'color-mix(in srgb, var(--assistant-text-faint) 45%, transparent)' },
    { key: 'overdue', label: 'Overdue', value: s.overdue, color: STATUS.overdue },
    { key: 'hold', label: 'On hold', value: s.onHold, color: STATUS.onHold },
  ];
  const total = s.due;
  return (
    <div>
      {total > 0 ? (
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img"
          aria-label={segments.map(x => `${x.label} ${x.value}`).join(', ')}>
          {segments.filter(x => x.value > 0).map(x => (
            <div key={x.key} title={`${x.label}: ${x.value}`}
              style={{ flexGrow: x.value, flexBasis: 0, background: x.color }} />
          ))}
        </div>
      ) : (
        <div className="h-3 w-full rounded-full" style={{ background: 'var(--assistant-border-soft)' }} />
      )}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {segments.map(x => (
          <div key={x.key} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.color }} aria-hidden="true" />
            <span style={{ color: 'var(--assistant-text-soft)' }}>{x.label}</span>
            <span className="ml-auto font-semibold tabular-nums" style={{ color: 'var(--assistant-text)' }}>
              {x.value}
              <span className="ml-1 font-normal" style={{ color: 'var(--assistant-text-faint)' }}>
                {total ? `${Math.round((x.value / total) * 100)}%` : ''}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownBars({ rows, empty }: { rows: BreakdownRow[]; empty: string }) {
  if (!rows.length) return <Empty text={empty} />;
  const max = Math.max(...rows.map(r => r.total));
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <div key={r.id} title={`${r.title}: ${r.done} of ${r.total} done`}>
          <div className="mb-1 flex items-baseline gap-2 text-[13px]">
            <span className="min-w-0 truncate font-medium" style={{ color: 'var(--assistant-text)' }}>{r.title}</span>
            {r.sub ? <span className="shrink-0 truncate text-[11px] uppercase tracking-wide" style={{ color: 'var(--assistant-text-faint)' }}>{r.sub}</span> : null}
            <span className="ml-auto shrink-0 tabular-nums" style={{ color: 'var(--assistant-text-soft)' }}>
              <span className="font-semibold" style={{ color: 'var(--assistant-text)' }}>{r.done}</span>/{r.total}
            </span>
          </div>
          <div className="flex h-2 gap-[2px]" style={{ width: `${(r.total / max) * 100}%`, minWidth: 8 }}>
            {r.done > 0 ? (
              <div className="rounded-full" style={{ flexGrow: r.done, flexBasis: 0, background: 'var(--assistant-accent)' }} />
            ) : null}
            {r.total - r.done > 0 ? (
              <div className="rounded-full" style={{ flexGrow: r.total - r.done, flexBasis: 0, background: 'color-mix(in srgb, var(--assistant-text-faint) 35%, transparent)' }} />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function FlagRows({ flags }: { flags: MonthStats['flags'] }) {
  const order: { color: TaskFlagColor; label: string }[] = [
    { color: 'red', label: 'Red · urgent' },
    { color: 'yellow', label: 'Yellow' },
    { color: 'blue', label: 'Blue' },
  ];
  if (order.every(o => flags[o.color].total === 0)) return <Empty text="No flagged tasks this month." />;
  return (
    <div className="space-y-3">
      {order.map(o => {
        const f = flags[o.color];
        const rate = f.total ? f.done / f.total : 0;
        return (
          <div key={o.color} className="flex items-center gap-3 text-[13px]">
            <TaskFlagIcon color={o.color} />
            <span className="w-24 shrink-0" style={{ color: 'var(--assistant-text-soft)' }}>{o.label}</span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--assistant-text-faint) 25%, transparent)' }}>
              <div className="h-full rounded-full" style={{ width: `${rate * 100}%`, background: 'var(--assistant-accent)' }} />
            </div>
            <span className="w-14 shrink-0 text-right tabular-nums" style={{ color: 'var(--assistant-text)' }}>
              <span className="font-semibold">{f.done}</span>
              <span style={{ color: 'var(--assistant-text-faint)' }}>/{f.total}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-20 items-center justify-center text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>
      {text}
    </div>
  );
}

/* ───────────────────────── One month ───────────────────────── */

function MonthSlide({ s, prev }: { s: MonthStats; prev?: MonthStats }) {
  const prevLabel = prev?.shortLabel ?? 'last month';
  const dayName = (day: number) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(Number(s.key.slice(0, 4)), Number(s.key.slice(5, 7)) - 1, day),
    );
  const isCurrent = s.elapsedDays < s.daysInMonth;
  const bestWeekday = s.weekday.reduce((b, v, i) => (v > s.weekday[b] ? i : b), 0);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Completed"
          value={fmtNum(s.completed)}
          sub={<Delta value={s.completed} prev={prev?.completed ?? null} prevLabel={prevLabel} />}
        />
        <KpiTile
          label="Completion rate"
          value={fmtPct(s.completionRate)}
          sub={<Delta value={s.completionRate} prev={prev?.completionRate ?? null} kind="pct" prevLabel={prevLabel} />}
        />
        <KpiTile
          label="Overdue"
          value={fmtNum(s.overdue)}
          sub={<Delta value={s.overdue} prev={prev?.overdue ?? null} invert prevLabel={prevLabel} />}
        />
        <KpiTile
          label="Tasks created"
          value={fmtNum(s.created)}
          sub={<Delta value={s.created} prev={prev?.created ?? null} prevLabel={prevLabel} />}
        />
        <KpiTile
          label="Active days"
          value={`${s.activeDays}`}
          sub={<span style={{ color: 'var(--assistant-text-faint)' }}>of {s.elapsedDays || s.daysInMonth} days · best streak {s.longestStreak}</span>}
        />
        <KpiTile
          label="Reminders"
          value={fmtNum(s.reminders)}
          sub={<span style={{ color: 'var(--assistant-text-faint)' }}>scheduled this month</span>}
        />
      </div>

      {/* Daily completions */}
      <Card
        title="Completed per day"
        aside={
          s.bestDay
            ? <>Best day <b style={{ color: 'var(--assistant-text)' }}>{dayName(s.bestDay.day)}</b> · {s.bestDay.count} done · avg {fmtNum(s.avgPerActiveDay, 1)}/active day</>
            : null
        }
      >
        {s.completed > 0 ? (
          <BarChart
            values={s.daily}
            xLabel={i => `${i + 1}`}
            tickEvery={s.daysInMonth > 20 ? 7 : 1}
            tooltip={i => `${dayName(i + 1)} · ${s.daily[i]} completed`}
            mutedFrom={isCurrent ? s.elapsedDays : undefined}
            ariaLabel={`Tasks completed per day in ${s.label}. Total ${s.completed}.`}
            height={200}
          />
        ) : (
          <Empty text={`No completed tasks in ${s.label}.`} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Task status" aside={`${s.due} task${s.due === 1 ? '' : 's'} due`}>
          <StatusBar s={s} />
        </Card>

        <Card
          title="Completed by weekday"
          aside={s.completed > 0 ? <>Most productive <b style={{ color: 'var(--assistant-text)' }}>{WEEKDAYS[bestWeekday]}</b></> : null}
        >
          {s.completed > 0 ? (
            <BarChart
              values={s.weekday}
              xLabel={i => WEEKDAYS[i]}
              tooltip={i => `${WEEKDAYS[i]} · ${s.weekday[i]} completed`}
              ariaLabel={`Tasks completed by weekday in ${s.label}.`}
              height={150}
            />
          ) : (
            <Empty text="Nothing completed yet." />
          )}
        </Card>

        <Card title="Top lists" aside="done / due">
          <BreakdownBars rows={s.byList} empty="No tasks due this month." />
        </Card>

        <div className="space-y-4">
          <Card title="By group" aside="done / due">
            <BreakdownBars rows={s.byProject} empty="No tasks due this month." />
          </Card>
          <Card title="Flags" aside="done / flagged">
            <FlagRows flags={s.flags} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Carousel ───────────────────────── */

export default function ProfileDashboard() {
  const { stats } = useDashboardData();
  const [index, setIndex] = useState<number | null>(null);
  const active = index ?? stats.length - 1; // open on the current month
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (i: number) => setIndex(Math.max(0, Math.min(stats.length - 1, i))),
    [stats.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') go(active - 1);
      if (e.key === 'ArrowRight') go(active + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, go]);

  // Keep the active month chip in view
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-month-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);

  if (!stats.length) return null;
  const current = stats[active];

  return (
    <section aria-roledescription="carousel" aria-label="Monthly dashboard">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium uppercase tracking-wide" style={{ color: 'var(--assistant-text-faint)' }}>
            Dashboard
          </h2>
          <div className="text-[24px] font-semibold leading-tight" style={{ color: 'var(--assistant-text)' }} aria-live="polite">
            {current.label}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            className={`flex h-9 w-9 items-center justify-center rounded-md ${classes.panelBtn}`}
            aria-label="Previous month"
            title="Previous month"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3 4.5 8l5 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            disabled={active === stats.length - 1}
            className={`flex h-9 w-9 items-center justify-center rounded-md ${classes.panelBtn}`}
            aria-label="Next month"
            title="Next month"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Month chips */}
      <div ref={chipsRef} className="mb-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {stats.map((s, i) => (
          <button
            key={s.key}
            type="button"
            data-month-index={i}
            onClick={() => go(i)}
            className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
            style={
              i === active
                ? { background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }
                : { background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-muted)' }
            }
            aria-current={i === active ? 'true' : undefined}
          >
            {s.shortLabel}{s.key.slice(0, 4) !== stats[stats.length - 1].key.slice(0, 4) ? ` ${s.key.slice(2, 4)}` : ''}
          </button>
        ))}
      </div>

      <div
        className="overflow-hidden"
        onPointerDown={e => { if (e.pointerType !== 'mouse') swipeRef.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={e => {
          const start = swipeRef.current;
          swipeRef.current = null;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(active + (dx < 0 ? 1 : -1));
        }}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(-${active * 100}%)`,
            transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {stats.map((s, i) => (
            <div
              key={s.key}
              className="w-full shrink-0"
              role="group"
              aria-roledescription="slide"
              aria-label={s.label}
              aria-hidden={i !== active}
              style={{ visibility: Math.abs(i - active) <= 1 ? 'visible' : 'hidden' }}
            >
              {/* Only the active month and its neighbours render — keeps the slide-in smooth */}
              {Math.abs(i - active) <= 1 ? <MonthSlide s={s} prev={stats[i - 1]} /> : null}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
        Completed tasks count on their due date. Use ← → or swipe to change month.
      </p>
    </section>
  );
}
