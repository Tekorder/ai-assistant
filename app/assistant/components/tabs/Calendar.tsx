'use client';
import React, { useEffect, useMemo, useState } from 'react';

import {
  LS_KEY_V2,
  LS_KEY_V1,
  isValidDateYYYYMMDD,
  startOfLocalDay,
  todayYMD,
  parseYMD,
  readViewSources,
  VIEW_FILTER_EVENT,
  type ViewSource,
  isListVisible,
  getTaskFlag,
  highestTaskFlag,
  type TaskFlagColor,
  recurringCalendarDays,
  isOccurrenceDone,
} from '@/lib/datacenter';
import { TaskFlagIcon } from '../TaskFlag';
import { useQuickFilters } from '../QuickFiltersContext';
import { useShowAllGroups } from '../../_hook/useShowAllGroups';
import { HabitDayDialog } from '../habits/HabitDayDialog';
import {
  HabitDayPills,
  ReminderDayDialog,
  ReminderDayPills,
  SourceToggle,
  useCalendarSource,
  useHabitCalendar,
  useReminderCalendar,
} from './CalendarSources';

/* ===================== Local types ===================== */

type CalCard = {
  id: string;
  listTitle: string;
  text: string;
  checked: boolean;
  deadline: string;
  isHidden?: boolean;
  archived?: boolean;
  flag?: TaskFlagColor;
};

type DayGroup = {
  listTitle: string;
  count: number;
  cards: CalCard[];
  listId: string;
};

/* ===================== Helpers ===================== */

function getMonthGrid(year: number, month: number): (string | null)[] {
  // month: 0-based
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  // We want Mon-first: shift so Mon=0
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
  }
  // Pad to complete last week row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dayDiff(ymd: string): number {
  const target = startOfLocalDay(parseYMD(ymd));
  const today = startOfLocalDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Pills inside month grid cells — no lime (lime reserved for calendar chrome / today / nav) */
function pillColorForCalendarCell(index: number, isLight = false): string {
  if (isLight) {
    const palettes = [
      'bg-sky-500/12 text-sky-700 border-sky-400/25',
      'bg-violet-500/12 text-violet-700 border-violet-400/25',
      'bg-rose-500/12 text-rose-700 border-rose-400/25',
      'bg-cyan-500/12 text-cyan-700 border-cyan-400/25',
      'bg-teal-500/12 text-teal-700 border-teal-400/25',
      'bg-fuchsia-500/12 text-fuchsia-700 border-fuchsia-400/25',
      'bg-indigo-500/12 text-indigo-700 border-indigo-400/25',
      'bg-orange-500/15 text-orange-700 border-orange-400/25',
    ];
    return palettes[index % palettes.length];
  }
  const palettes = [
    'bg-sky-500/15 text-sky-200 border-sky-400/25',
    'bg-violet-500/15 text-violet-200 border-violet-400/25',
    'bg-rose-500/15 text-rose-200 border-rose-400/25',
    'bg-cyan-500/15 text-cyan-200 border-cyan-400/25',
    'bg-teal-500/15 text-teal-200 border-teal-400/25',
    'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/25',
    'bg-indigo-500/15 text-indigo-200 border-indigo-400/25',
    'bg-orange-500/18 text-orange-200 border-orange-400/25',
  ];
  return palettes[index % palettes.length];
}

const CALENDAR_CELL_FILL_COLORS = [
  'bg-sky-400',
  'bg-violet-400',
  'bg-rose-400',
  'bg-cyan-400',
  'bg-teal-400',
  'bg-fuchsia-400',
  'bg-indigo-400',
  'bg-orange-400',
] as const;

const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/* ===================== Main Component ===================== */

export default function CalendarView({
  isLight = false,
  onOpenDayPanel,
  openDayYmids = [],
}: {
  isLight?: boolean;
  onOpenDayPanel?: (ymd: string) => void;
  openDayYmids?: string[];
}) {
  // One entry per group shown: the selected group, or every group under "Show all"
  const [sources, setSources]   = useState<ViewSource[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showAll]               = useShowAllGroups();
  // Same "View by" as Workspace: tasks sit on their due date or their creation date
  const { sortBy, setSortBy }   = useQuickFilters();
  // What the calendar shows: tasks (by list), habits, or reminders
  const [source, setSource]     = useCalendarSource();
  const isTasks                 = source === 'tasks';
  const byCreated               = isTasks && sortBy === 'createdAt';
  const [habitDay, setHabitDay]       = useState<string | null>(null);
  const [reminderDay, setReminderDay] = useState<string | null>(null);
  const projectTitle            = !isTasks
    ? (source === 'habits' ? 'Your habits' : 'Reminders & habit reminders')
    : sources[0]?.focusListTitle
    ? `${sources[0].title} › ${sources[0].focusListTitle}`
    : showAll ? 'All groups' : (sources[0]?.title || 'Group');

  // Calendar nav
  const today = todayYMD();
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0-based

  const openDaySet = useMemo(() => new Set(openDayYmids), [openDayYmids]);

  /* ── Load & sync ── */
  useEffect(() => {
    const load = () => {
      setSources(readViewSources());
      setHydrated(true);
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_V2 || e.key === LS_KEY_V1) load();
    };
    window.addEventListener('youtask_projects_updated', load);
    window.addEventListener('youtask_blocks_updated', load);
    window.addEventListener(VIEW_FILTER_EVENT, load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', load);
      window.removeEventListener('youtask_blocks_updated', load);
      window.removeEventListener(VIEW_FILTER_EVENT, load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /* ── Build cards from blocks ── */
  const allCards = useMemo<CalCard[]>(() => {
    const out: CalCard[] = [];
    for (const { blocks, visibleLists, title: groupTitle } of sources) {
    let currentListTitle = '';
    let currentListId: string | null = null;
    let currentListVisible = true;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];

      if (b.indent === 0) {
        currentListTitle = (b.text || '').trim();
        currentListId = b.id;
        currentListVisible = isListVisible(visibleLists, b.id);
        continue;
      }

      if (b.indent !== 1 || b.section) continue;
      if (currentListId && !currentListVisible) continue;
      if (b.archived) continue; // 👈 ocultar archivados
      const day = byCreated ? b.createdAt : b.deadline;
      if (!isValidDateYYYYMMDD(day)) continue;

      const listTitle = currentListTitle || groupTitle || 'General';
      const card = {
        id:        b.id,
        // Under "Show all" the group name leads, so same-named lists in different groups stay apart
        listTitle: showAll ? `${groupTitle} · ${listTitle}` : listTitle,
        text:      b.text || '',
        checked:   Boolean(b.checked),
        // The day the task sits on (due or created, per "View by")
        deadline:  day!,
        isHidden:  b.isHidden === true,
        archived:  b.archived,
        flag: getTaskFlag(b),
      };
      // A recurring task sits on each of its repeat days, done or not per day
      const repeats = byCreated ? [] : recurringCalendarDays(b);
      if (repeats.length) {
        for (const ymd of repeats) out.push({ ...card, deadline: ymd, checked: isOccurrenceDone(b, ymd) });
      } else {
        out.push(card);
      }
    }
    }

    return out;
  }, [sources, showAll, byCreated]);

  /* ── Cards by date ── */
  const cardsByDate = useMemo(() => {
    const map: Record<string, CalCard[]> = {};
    for (const c of allCards) {
      if (!map[c.deadline]) map[c.deadline] = [];
      map[c.deadline].push(c);
    }
    return map;
  }, [allCards]);

  /* ── Groups for a given day (by list) ── */
  const getGroupsForDay = (ymd: string): DayGroup[] => {
    const cards = cardsByDate[ymd] || [];
    const byList: Record<string, { title: string; cards: CalCard[] }> = {};
    const order: string[] = [];
    for (const c of cards) {
      const key = c.listTitle;
      if (!byList[key]) { byList[key] = { title: key, cards: [] }; order.push(key); }
      byList[key].cards.push(c);
    }
    return order.map(k => ({
      listId:    k,
      listTitle: byList[k].title,
      count:     byList[k].cards.length,
      cards:     byList[k].cards,
    }));
  };

  /* ── Month grid ── */
  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const habitDays    = useHabitCalendar(grid, today);
  const reminderDays = useReminderCalendar(grid);
  /** Something to show on the day, for the current source */
  const dayHasItems = (ymd: string) =>
    source === 'habits' ? Boolean(habitDays[ymd]) : source === 'reminders' ? Boolean(reminderDays[ymd]) : Boolean(cardsByDate[ymd]?.length);
  const isDaySelected = (ymd: string) =>
    source === 'habits' ? habitDay === ymd : source === 'reminders' ? reminderDay === ymd : openDaySet.has(ymd);
  const renderSourcePills = (ymd: string) =>
    source === 'habits' ? <HabitDayPills items={habitDays[ymd] ?? []} />
    : source === 'reminders' ? <ReminderDayPills items={reminderDays[ymd] ?? []} past={ymd < today} />
    : renderDayPills(ymd);

  /* ── Navigation ── */
  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => {
    setViewYear(new Date().getFullYear());
    setViewMonth(new Date().getMonth());
    handleDayClick(today);
  };

  // Tasks open the day panel; habits and reminders their own day view
  function handleDayClick(ymd: string) {
    if (source === 'habits') setHabitDay(ymd);
    else if (source === 'reminders') setReminderDay(ymd);
    else onOpenDayPanel?.(ymd);
  }

  /* ── Unique list titles (for color assignment) ── */
  const listTitleIndex = useMemo(() => {
    const map: Record<string, number> = {};
    let i = 0;
    for (const c of allCards) {
      if (!(c.listTitle in map)) map[c.listTitle] = i++;
    }
    return map;
  }, [allCards]);

  /* ── Render pill dots for a day cell ── */
  const renderDayPills = (ymd: string) => {
    const groups = getGroupsForDay(ymd);
    if (!groups.length) return null;
    return (
      <div className="mt-1 flex flex-col gap-[4px]">
        {groups.slice(0, 3).map(g => {
          const done  = g.cards.filter(c => c.checked).length;
          const total = g.cards.length;
          const pct   = total > 0 ? (done / total) * 100 : 0;
          const allDone = done === total && total > 0;
          const idx   = listTitleIndex[g.listTitle] ?? 0;

          const fillColor = CALENDAR_CELL_FILL_COLORS[idx % CALENDAR_CELL_FILL_COLORS.length];

          return (
            <div
              key={g.listId}
              className={`relative overflow-hidden rounded-md border px-1.5 pt-[3px] pb-[5px] ${pillColorForCalendarCell(idx, isLight)}`}
              data-tip={`${g.listTitle}: ${done}/${total}`}
            >
              {/* Label row */}
              <div className="flex items-center justify-between gap-1 leading-none mb-[4px]">
                <span className="text-[10px] md:text-[11px] font-medium break-words">
                  <span className="hidden md:inline">{g.listTitle}</span>
                  <span className="md:hidden">{g.listTitle.slice(0, 8)}</span>
                </span>
                <span className="text-[9px] md:text-[10px] opacity-60 shrink-0 tabular-nums">
                  {allDone ? '✓' : `${done}/${total}`}
                </span>
              </div>

              {/* Progress track */}
              <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'var(--assistant-control-bg)' }}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.35)]' : fillColor}`}
                  style={{ width: `${pct}%`, opacity: allDone ? 0.95 : 0.8 }}
                />
              </div>
            </div>
          );
        })}
        {groups.length > 3 && (
          <div className="text-[10px] pl-1" style={{ color: 'var(--assistant-text-faint)' }}>+{groups.length - 3} more</div>
        )}
      </div>
    );
  };

  if (!hydrated) {
    return (
      <div className="h-full w-full bg-transparent flex items-center justify-center">
        <span className="text-sm" style={{ color: 'var(--assistant-tone-1)' }}>Loading calendar…</span>
      </div>
    );
  }

  return (
    // inline-size containment: day contents (long reminder titles) wrap instead of widening the panel
    <div className="relative h-full w-full overflow-y-auto bg-transparent" style={{ color: 'var(--assistant-text)', contain: 'inline-size' }}>
      {/* Fills the tab's height so the month grid can stretch down (desktop) */}
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-3 pt-3 pb-20 md:px-8 md:py-8">

        {/* ── Header / nav bar ── */}
        <div
          className="mb-4 flex items-center justify-between rounded-2xl px-3 py-2.5 md:px-4 md:py-3"
          style={{ border: '1px solid color-mix(in srgb, var(--assistant-tone-1) 12%, transparent)', boxShadow: 'inset 0 1px 0 var(--assistant-border-soft)' }}
        >
          <div>
            <h1 className="text-[25px] md:text-[29px] font-bold leading-none" style={{ color: 'var(--assistant-text)' }}>
              {MONTH_NAMES[viewMonth]}{' '}
              <span style={{ color: 'var(--assistant-tone-1)' }}>{viewYear}</span>
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--assistant-text-faint)' }}>{projectTitle}</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <SourceToggle value={source} onChange={setSource} />
            {/* View by: due date or creation date (shared with Workspace's "View by") */}
            {isTasks ? <div
              role="radiogroup"
              aria-label="Place tasks by"
              className="flex items-center rounded-xl p-0.5"
            >
              {([['dueDate', 'Due date'], ['createdAt', 'Created']] as const).map(([value, label]) => {
                const on = sortBy === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSortBy(value)}
                    className="rounded-[10px] px-2.5 py-1 text-[12px] transition-colors"
                    style={on
                      ? { background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)', fontWeight: 600 }
                      : { color: 'var(--assistant-text-soft)' }}
                  >
                    {label}
                  </button>
                );
              })}
            </div> : null}
            <button
              type="button"
              onClick={goToday}
              className="text-[12px] px-3 py-1.5 rounded-xl transition-all hover:scale-105"
              style={{
                color: 'var(--assistant-tone-1)',
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--assistant-tone-1) 20%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 10%, transparent) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.1), 0 2px 8px rgba(0,0,0,.15)',
              }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={prevMonth}
              className="h-8 w-8 flex items-center justify-center transition-colors"
              style={{ color: 'var(--assistant-text-soft)' }}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="h-8 w-8 flex items-center justify-center transition-colors"
              style={{ color: 'var(--assistant-text-soft)' }}
            >
              ›
            </button>
          </div>
        </div>

        {/* ── Weekday headers — desktop only; mobile pills already show the day abbreviation ── */}
        <div className="hidden md:grid grid-cols-7 mb-1">
          {WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center py-2 text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--assistant-text-soft)' }}>
              {wd}
            </div>
          ))}
        </div>

        {/* ── Desktop: 7-col grid ── */}
        {/* Weeks share the leftover height evenly (never shorter than a cell's content; scrolls if the window is too short) */}
        <div className="hidden md:grid flex-1 grid-cols-7 auto-rows-fr gap-[3px] rounded-2xl overflow-hidden p-[3px] bg-transparent">
          {grid.map((ymd, idx) => {
            const isToday    = ymd === today;
            const isSelected = ymd ? isDaySelected(ymd) : false;
            const dayCards   = ymd && isTasks ? (cardsByDate[ymd] ?? []) : [];
            const hasCards   = ymd ? dayHasItems(ymd) : false;
            const isPast     = ymd ? dayDiff(ymd) < 0 : false;
            // "Overdue" only means something when placing by due date
            const isOverdue  = !byCreated && isPast && hasCards && dayCards.some(c => !c.checked);
            const [,, dayNum] = ymd ? ymd.split('-') : ['', '', ''];

            return (
              <div
                key={idx}
                onClick={() => ymd && handleDayClick(ymd)}
                className={[
                  'relative min-h-[100px] rounded-xl p-2 transition-all duration-150',
                  ymd ? 'cursor-pointer' : '',
                ].join(' ')}
                style={ymd ? {
                  background: isSelected
                    ? `linear-gradient(145deg, color-mix(in srgb, var(--assistant-tone-1) 20%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 8%, transparent) 100%)`
                    : isOverdue
                    ? 'rgba(239,68,68,.06)'
                    : hasCards
                    ? 'color-mix(in srgb, var(--assistant-accent) 12%, var(--assistant-control-bg))'
                    : 'var(--assistant-control-bg)',
                  border: isSelected
                    ? `1px solid color-mix(in srgb, var(--assistant-tone-1) 30%, transparent)`
                    : isToday
                    ? `1px solid color-mix(in srgb, var(--assistant-tone-1) 22%, transparent)`
                    : isOverdue
                    ? '1px solid rgba(239,68,68,.15)'
                    : '1px solid var(--assistant-border-soft)',
                  boxShadow: isSelected
                    ? `inset 0 1px 0 rgba(255,255,255,.1), 0 2px 12px color-mix(in srgb, var(--assistant-tone-1) 15%, transparent)`
                    : 'none',
                } : {
                  background: 'var(--assistant-control-bg)',
                  border: '1px solid var(--assistant-border-soft)',
                }}
              >
                {ymd && (
                  <>
                    {/* Day number + status badge */}
                    <div className="flex items-center gap-1 mb-1">
                      <div
                        className="relative inline-flex items-center justify-center w-7 h-7 rounded-full text-[14px] font-semibold leading-none transition-colors shrink-0"
                        style={isToday ? {
                          background: `color-mix(in srgb, var(--assistant-tone-1) 18%, transparent)`,
                          color: 'var(--assistant-tone-1)',
                          border: `1px solid color-mix(in srgb, var(--assistant-tone-1) 40%, transparent)`,
                          boxShadow: `0 0 14px color-mix(in srgb, var(--assistant-tone-1) 22%, transparent)`,
                        } : isSelected ? {
                          background: `color-mix(in srgb, var(--assistant-tone-1) 14%, transparent)`,
                          color: 'var(--assistant-text)',
                          border: `1px solid color-mix(in srgb, var(--assistant-tone-1) 30%, transparent)`,
                        } : isOverdue ? {
                          color: 'var(--assistant-danger-text)',
                        } : {
                          color: 'var(--assistant-text-muted)',
                        }}
                      >
                        {parseInt(dayNum)}
                      </div>
                      {(() => {
                        const dayFlag = highestTaskFlag(
                          dayCards.filter(c => !c.checked).map(c => c.flag),
                        );
                        return dayFlag ? (
                          <span className="h-4 w-4 flex items-center justify-center" data-tip="Has flagged task" aria-label="Has flagged task">
                            <TaskFlagIcon color={dayFlag} className="h-3.5 w-3.5" />
                          </span>
                        ) : null;
                      })()}
                      {isOverdue && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide leading-none" style={{ color: 'var(--assistant-danger-text)' }}>
                          overdue
                        </span>
                      )}
                    </div>

                    {/* Pills */}
                    {renderSourcePills(ymd)}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Mobile: 2-col grid ── */}
        <div className="md:hidden grid grid-cols-2 gap-2">
          {grid.filter(Boolean).map((ymd) => {
            if (!ymd) return null;
            const isToday    = ymd === today;
            const isSelected = isDaySelected(ymd);
            const groups     = isTasks ? getGroupsForDay(ymd) : [];
            const [,, dayNum] = ymd.split('-');
            const weekday    = new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
            const hasAnyTask = dayHasItems(ymd);
            const isPast     = dayDiff(ymd) < 0;
            const isOverdue  = !byCreated && isPast && hasAnyTask && groups.flatMap(g => g.cards).some(c => !c.checked);

            return (
              <div
                key={ymd}
                onClick={() => handleDayClick(ymd)}
                className="rounded-xl p-3 cursor-pointer transition-all duration-150"
                style={{
                  background: isSelected
                    ? `linear-gradient(145deg, color-mix(in srgb, var(--assistant-tone-1) 20%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 8%, transparent) 100%)`
                    : isOverdue ? 'rgba(239,68,68,.06)'
                    : isToday
                    ? `linear-gradient(145deg, color-mix(in srgb, var(--assistant-tone-1) 14%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 5%, transparent) 100%)`
                    : hasAnyTask
                    ? 'color-mix(in srgb, var(--assistant-accent) 12%, var(--assistant-control-bg))'
                    : 'var(--assistant-control-bg)',
                  border: isSelected
                    ? `1px solid color-mix(in srgb, var(--assistant-tone-1) 30%, transparent)`
                    : isToday
                    ? `1px solid color-mix(in srgb, var(--assistant-tone-1) 22%, transparent)`
                    : isOverdue ? '1px solid rgba(239,68,68,.15)'
                    : '1px solid var(--assistant-border-soft)',
                  boxShadow: isSelected
                    ? `inset 0 1px 0 rgba(255,255,255,.1), 0 2px 12px color-mix(in srgb, var(--assistant-tone-1) 15%, transparent)`
                    : 'none',
                }}
              >
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[19px] font-bold leading-none"
                      style={{
                        color: isOverdue ? 'var(--assistant-danger-text)'
                          : isToday ? 'var(--assistant-tone-1)'
                          : 'var(--assistant-text)',
                      }}
                    >
                      {parseInt(dayNum)}
                    </span>
                    <span className="text-[11px] uppercase" style={{ color: 'var(--assistant-text-faint)' }}>{weekday}</span>
                    {(() => {
                      const dayFlag = highestTaskFlag(
                        groups.flatMap(g => g.cards).filter(c => !c.checked).map(c => c.flag),
                      );
                      return dayFlag ? (
                        <span className="h-4 w-4 flex items-center justify-center" data-tip="Has flagged task" aria-label="Has flagged task">
                          <TaskFlagIcon color={dayFlag} className="h-3.5 w-3.5" />
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {isOverdue && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-danger-text)' }}>overdue</span>
                  )}
                </div>

                {/* Pills — all of them, no cap */}
                {!isTasks ? (
                  hasAnyTask ? renderSourcePills(ymd) : <div className="text-[11px]" style={{ color: 'var(--assistant-text-faint)' }}>—</div>
                ) : groups.length > 0 ? (
                  <div className="space-y-[4px]">
                    {groups.map((g, gi) => {
                      const done  = g.cards.filter(c => c.checked).length;
                      const total = g.cards.length;
                      const pct   = total > 0 ? (done / total) * 100 : 0;
                      const pillDone = done === total && total > 0;
                      const colorIdx = listTitleIndex[g.listTitle] ?? gi;
                      const fillColor = CALENDAR_CELL_FILL_COLORS[colorIdx % CALENDAR_CELL_FILL_COLORS.length];
                      return (
                        <div
                          key={g.listId}
                          className={`relative overflow-hidden rounded-md border px-1.5 pt-[3px] pb-[5px] ${pillColorForCalendarCell(colorIdx, isLight)}`}
                          data-tip={`${g.listTitle}: ${done}/${total}`}
                        >
                          <div className="flex items-start justify-between gap-1 leading-tight mb-[4px]">
                            <span className="min-w-0 text-[10px] font-medium break-words">{g.listTitle}</span>
                            <span className="text-[9px] opacity-60 shrink-0">{pillDone ? '✓' : `${done}/${total}`}</span>
                          </div>
                          <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'var(--assistant-control-bg)' }}>
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${pillDone ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.35)]' : fillColor}`}
                              style={{ width: `${pct}%`, opacity: pillDone ? 0.95 : 0.8 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {groups.length > 2 && (
                      <div className="text-[10px]" style={{ color: 'var(--assistant-text-faint)' }}>+{groups.length - 2}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px]" style={{ color: 'var(--assistant-text-faint)' }}>—</div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {habitDay ? <HabitDayDialog ymd={habitDay} onClose={() => setHabitDay(null)} /> : null}
      {reminderDay ? (
        <ReminderDayDialog ymd={reminderDay} items={reminderDays[reminderDay] ?? []} today={today} onClose={() => setReminderDay(null)} />
      ) : null}
    </div>
  );
}
