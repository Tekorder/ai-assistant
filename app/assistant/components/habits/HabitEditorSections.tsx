'use client';

import React, { useState } from 'react';
import { WEEKDAYS, isValidTimeHHMM, type Habit } from '@/lib/datacenter';
import { HABIT_UNITS } from '@/app/assistant/_constants/habitTemplates';
import { TIME_RANGES, goalSentence } from '@/app/assistant/_utils/habitSchedule';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitChips, HabitRow, HabitSection, HabitSwitch } from './HabitModal';
import { DateField } from '../DatePickerModal';
import { TimeField } from '../TimePicker';

type Patch = (p: Partial<Habit>) => void;

export const ALL_DAYS = WEEKDAYS.map(d => d.value);

const inputCls = `rounded-lg px-2.5 py-1.5 text-[14px] ${classes.panelInput}`;
const labelStyle = { color: 'var(--assistant-text-muted)' } as const;

/** Build/Quit, goal amount per period, and (daily goals) the days it's due. */
export function GoalSection({ draft, patch, days, setDays }: {
  draft: Habit;
  patch: Patch;
  /** Selected weekdays (all 7 = every day) */
  days: number[];
  setDays: (d: number[]) => void;
}) {
  const quit = draft.kind === 'quit';
  return (
    <HabitSection>
      <HabitRow label="Habit type" hint={quit ? 'Do it less — log each time it happens' : 'Do it more — log what you get done'}>
        <HabitChips ariaLabel="Habit type" value={draft.kind}
          options={[{ value: 'build', label: 'Build' }, { value: 'quit', label: 'Quit' }]}
          onChange={kind => patch({ kind, goalValue: kind === 'quit' ? 0 : Math.max(1, draft.goalValue) })} />
      </HabitRow>
      <HabitRow label="Goal period">
        <HabitChips ariaLabel="Goal period" value={draft.goalPeriod}
          options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]}
          onChange={goalPeriod => patch({ goalPeriod })} />
      </HabitRow>
      <HabitRow label={quit ? 'At most' : 'Goal'}>
        <input
          type="number" min={0} step="any" inputMode="decimal"
          value={Number.isFinite(draft.goalValue) ? draft.goalValue : ''}
          onChange={e => patch({ goalValue: e.target.value === '' ? NaN : Math.max(0, Number(e.target.value)) })}
          aria-label="Goal amount"
          className={`${inputCls} w-24 text-right`}
        />
        <input
          list="habit-units" value={draft.goalUnit}
          onChange={e => patch({ goalUnit: e.target.value })}
          aria-label="Unit"
          className={`${inputCls} w-24`}
        />
        <datalist id="habit-units">{HABIT_UNITS.map(u => <option key={u} value={u} />)}</datalist>
        <span className="text-[13px]" style={labelStyle}>/ {draft.goalPeriod}</span>
      </HabitRow>
      {draft.goalPeriod === 'day' ? (
        <div className="py-2">
          <div className="mb-2 text-[14px] font-medium" style={{ color: 'var(--assistant-text)' }}>Days</div>
          <div className="flex justify-between gap-1" role="group" aria-label="Weekdays">
            {WEEKDAYS.map(d => {
              const on = days.includes(d.value);
              return (
                <button
                  key={d.value} type="button" aria-pressed={on} aria-label={d.long} data-tip={d.long}
                  onClick={() => setDays(on ? days.filter(x => x !== d.value) : [...days, d.value])}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${on ? '' : classes.modalSecondaryButton}`}
                  style={on ? { background: 'var(--habit-color)', color: 'var(--habit-on)' } : undefined}
                >
                  {d.letter}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
            {[{ label: 'Every day', days: ALL_DAYS }, { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] }, { label: 'Weekends', days: [6, 0] }].map(p => (
              <button key={p.label} type="button" onClick={() => setDays(p.days)}
                className={`rounded-full px-2.5 py-1 ${classes.modalSecondaryButton}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="pt-1 text-[12px] font-medium" style={{ color: 'var(--habit-ink)' }}>
        {Number.isFinite(draft.goalValue) ? goalSentence(draft) : 'Enter a goal amount'}
        {draft.goalPeriod === 'day' && days.length > 0 && days.length < 7 ? ` · ${days.length} day${days.length === 1 ? '' : 's'} a week` : ''}
      </p>
    </HabitSection>
  );
}

export function TimeRangeSection({ draft, patch }: { draft: Habit; patch: Patch }) {
  return (
    <HabitSection>
      <div className="mb-2 text-[14px] font-medium" style={{ color: 'var(--assistant-text)' }}>Time of day</div>
      <HabitChips ariaLabel="Time of day" value={draft.timeRange} options={TIME_RANGES} onChange={timeRange => patch({ timeRange })} />
    </HabitSection>
  );
}

/** Reminder switch, its times and message. */
export function ReminderSection({ draft, patch }: { draft: Habit; patch: Patch }) {
  const [time, setTime] = useState('09:00');
  const addTime = () => {
    if (!isValidTimeHHMM(time) || draft.reminderTimes.includes(time)) return;
    patch({ reminderTimes: [...draft.reminderTimes, time].sort() });
  };
  return (
    <HabitSection>
      <HabitRow label="Reminders" hint="A notification while YouTask is open">
        <HabitSwitch label="Reminders" on={draft.remindersOn}
          onChange={on => patch({ remindersOn: on, reminderTimes: on && !draft.reminderTimes.length ? ['09:00'] : draft.reminderTimes })} />
      </HabitRow>
      {draft.remindersOn ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5 py-2">
            {draft.reminderTimes.map(t => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-[13px] font-medium"
                style={{ background: 'var(--habit-color)', color: 'var(--habit-on)' }}>
                {t}
                <button type="button" aria-label={`Remove ${t}`} onClick={() => patch({ reminderTimes: draft.reminderTimes.filter(x => x !== t) })}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] opacity-80 hover:opacity-100">
                  ✕
                </button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <TimeField title="Reminder time" value={time} onChange={setTime}
                className={`${inputCls} py-1 text-[13px]`} />
              <button type="button" onClick={addTime} aria-label="Add time" data-tip="Add time"
                className={`flex h-7 w-7 items-center justify-center rounded-full ${classes.modalSecondaryButton}`}>
                +
              </button>
            </span>
          </div>
          <input
            value={draft.reminderMessage ?? ''}
            onChange={e => patch({ reminderMessage: e.target.value })}
            placeholder="Reminder message (optional)"
            aria-label="Reminder message"
            className={`${inputCls} mb-1 w-full`}
          />
        </>
      ) : null}
    </HabitSection>
  );
}

/** Memo prompt, what the card's button does, chart type. */
export function BehaviorSection({ draft, patch }: { draft: Habit; patch: Patch }) {
  return (
    <HabitSection>
      <HabitRow label="Memo after check-in" hint="Ask for a note each time it's done">
        <HabitSwitch label="Memo after check-in" on={draft.memoOnComplete} onChange={memoOnComplete => patch({ memoOnComplete })} />
      </HabitRow>
      {draft.kind === 'build' ? (
        <HabitRow label="Card button" hint={draft.barAction === 'add' ? 'Asks how much to log' : 'Completes the goal in one tap'}>
          <HabitChips ariaLabel="Card button" value={draft.barAction}
            options={[{ value: 'done', label: 'Mark done' }, { value: 'add', label: 'Add amount' }]}
            onChange={barAction => patch({ barAction })} />
        </HabitRow>
      ) : null}
      <HabitRow label="Chart">
        <HabitChips ariaLabel="Chart type" value={draft.chartType}
          options={[{ value: 'bar', label: 'Bars' }, { value: 'line', label: 'Line' }]}
          onChange={chartType => patch({ chartType })} />
      </HabitRow>
    </HabitSection>
  );
}

/** Start and (optional) end date. */
export function TermSection({ draft, patch }: { draft: Habit; patch: Patch }) {
  return (
    <HabitSection>
      <div className="mb-2 text-[14px] font-medium" style={{ color: 'var(--assistant-text)' }}>Habit term</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px]" style={labelStyle}>Start</span>
          <DateField title="Start date" value={draft.startDate}
            onChange={startDate => patch({ startDate })}
            className={`${inputCls} min-w-0 text-[13px]`} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px]" style={labelStyle}>End</span>
          <div className="flex min-w-0 items-center gap-1">
            <DateField title="End date" value={draft.endDate} min={draft.startDate}
              onChange={endDate => patch({ endDate })}
              onClear={() => patch({ endDate: undefined })}
              className={`${inputCls} min-w-0 flex-1 text-[13px]`} />
          </div>
          {!draft.endDate ? <span className="text-[11px]" style={{ color: 'var(--assistant-text-faint)' }}>No end</span> : (
            <button type="button" onClick={() => patch({ endDate: undefined })} className="self-start text-[11px] underline"
              style={{ color: 'var(--assistant-text-faint)' }}>
              Remove end date
            </button>
          )}
        </label>
      </div>
    </HabitSection>
  );
}
