'use client';

import React, { useEffect, useRef, useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';

/* ── Examples ───────────────────────────────────────────────
   Clicking a list example also swaps the task suggestions on step 2
   to ones that fit it; any other name gets the generic set. */
const LIST_EXAMPLES: { name: string; tasks: string[] }[] = [
  { name: 'Website launch', tasks: ['Write homepage copy', 'Pick a domain name', 'Set up analytics'] },
  { name: 'Q3 marketing plan', tasks: ['Define campaign goals', 'Draft the content calendar', 'Set the ad budget'] },
  { name: 'Home renovation', tasks: ['Get three contractor quotes', 'Choose paint colors', 'Order kitchen tiles'] },
  { name: 'Weekly errands', tasks: ['Buy groceries', 'Pay the electricity bill', 'Book a dentist appointment'] },
];

const GENERIC_TASKS = ['Draft the project brief', 'Set up a kickoff meeting', 'Share the timeline with the team'];

function suggestionsFor(listName: string): string[] {
  const match = LIST_EXAMPLES.find(e => e.name.toLowerCase() === listName.trim().toLowerCase());
  return match ? match.tasks : GENERIC_TASKS;
}

type Props = {
  onFinish: (listName: string, tasks: string[]) => void;
  onClose: () => void;
};

export function FirstListWizard({ onFinish, onClose }: Props) {
  const [step, setStep] = useState<0 | 1>(0);
  const [listName, setListName] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const listInputRef = useRef<HTMLInputElement | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => (step === 0 ? listInputRef : taskInputRef).current?.focus());
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trimmedName = listName.trim();
  const canContinue = trimmedName.length > 0;
  const suggestions = suggestionsFor(listName).filter(
    s => !tasks.some(t => t.toLowerCase() === s.toLowerCase()),
  );

  const addTask = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setTasks(prev => (prev.some(t => t.toLowerCase() === text.toLowerCase()) ? prev : [...prev, text]));
    setTaskDraft('');
    taskInputRef.current?.focus();
  };

  // A task still typed in the box counts — people often hit Finish instead of Enter.
  const pendingTasks = taskDraft.trim() ? [...tasks, taskDraft.trim()] : tasks;
  const canFinish = pendingTasks.length > 0;

  const finish = () => {
    if (!canFinish || !canContinue) return;
    onFinish(trimmedName, pendingTasks);
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
      <style>{`
        @keyframes flwIn   { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes flwStep { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
        @keyframes flwFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Backdrop doesn't close — a stray click shouldn't throw away what was typed */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(17, 37, 77, .28)', backdropFilter: 'blur(6px)', animation: 'flwFade .2s ease-out both' }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flw-title"
        className="relative w-full max-w-[520px] overflow-hidden rounded-2xl"
        style={{
          background: 'var(--assistant-overlay-panel-bg, var(--assistant-panel-bg))',
          color: 'var(--assistant-text)',
          border: '1px solid var(--assistant-border-soft)',
          boxShadow: '0 24px 60px rgba(17, 37, 77, .28)',
          animation: 'flwIn .3s cubic-bezier(.25,.9,.3,1) both',
        }}
      >
        {/* Header: progress + close */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of 2`}>
            {[0, 1].map(i => (
              <span
                key={i}
                className="block h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === step ? 20 : 6,
                  background: i <= step ? 'var(--assistant-accent)' : 'color-mix(in srgb, var(--assistant-text) 15%, transparent)',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`-mr-2 flex h-8 w-8 items-center justify-center rounded-lg ${classes.panelCloseBtn}`}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div key={step} className="px-6 pb-6 pt-4" style={{ animation: 'flwStep .25s cubic-bezier(.25,.9,.3,1) both' }}>
          {step === 0 ? (
            <form onSubmit={e => { e.preventDefault(); if (canContinue) setStep(1); }}>
              <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-accent)' }}>
                Step 1 of 2
              </div>
              <h2 id="flw-title" className="mt-1 text-[23px] font-bold leading-tight">
                Create your first task list
              </h2>
              <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: 'var(--assistant-text-muted)' }}>
                Name it after a project, a goal, or an area of your life.
              </p>

              <label htmlFor="flw-list" className="mt-5 block text-[13px] font-medium" style={{ color: 'var(--assistant-text-soft)' }}>
                List name
              </label>
              <input
                id="flw-list"
                ref={listInputRef}
                value={listName}
                onChange={e => setListName(e.target.value)}
                placeholder="e.g. Website launch"
                maxLength={80}
                className={`mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-[15px] ${classes.panelInput}`}
              />

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>Try one:</span>
                {LIST_EXAMPLES.map(ex => (
                  <button
                    key={ex.name}
                    type="button"
                    onClick={() => { setListName(ex.name); listInputRef.current?.focus(); }}
                    className={`rounded-full px-2.5 py-1 text-[12px] ${classes.wizardChip}`}
                  >
                    {ex.name}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  disabled={!canContinue}
                  className={`rounded-xl px-5 py-2.5 text-[14px] font-semibold ${classes.wizardPrimaryBtn}`}
                >
                  Continue
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-accent)' }}>
                Step 2 of 2
              </div>
              <h2 id="flw-title" className="mt-1 text-[23px] font-bold leading-tight">
                Add tasks to &ldquo;{trimmedName}&rdquo;
              </h2>
              <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: 'var(--assistant-text-muted)' }}>
                What needs to get done? Add a few — you can always add more later.
              </p>

              <form
                className="mt-5 flex items-center gap-2"
                onSubmit={e => { e.preventDefault(); addTask(taskDraft); }}
              >
                <input
                  ref={taskInputRef}
                  value={taskDraft}
                  onChange={e => setTaskDraft(e.target.value)}
                  placeholder={`e.g. ${suggestionsFor(listName)[0]}`}
                  maxLength={200}
                  aria-label="New task"
                  className={`min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-[15px] ${classes.panelInput}`}
                />
                <button
                  type="submit"
                  disabled={!taskDraft.trim()}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-[14px] font-medium ${classes.modalSecondaryButton} disabled:opacity-40`}
                >
                  Add
                </button>
              </form>

              {suggestions.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>Ideas:</span>
                  {suggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addTask(s)}
                      className={`rounded-full px-2.5 py-1 text-[12px] ${classes.wizardChip}`}
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 max-h-[200px] overflow-y-auto">
                {tasks.length === 0 ? (
                  <div className="py-3 text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>
                    No tasks yet — type one above and press Enter.
                  </div>
                ) : (
                  tasks.map((t, i) => (
                    <div
                      key={`${t}-${i}`}
                      className="group flex items-center gap-2.5 py-2"
                      style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-[2px]"
                        style={{ border: '1.5px solid var(--assistant-text)' }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{t}</span>
                      <button
                        type="button"
                        onClick={() => setTasks(prev => prev.filter((_, j) => j !== i))}
                        className={`h-6 w-6 shrink-0 rounded-md text-[12px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${classes.panelCloseBtn}`}
                        aria-label={`Remove "${t}"`}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className={`rounded-xl px-4 py-2.5 text-[14px] font-medium ${classes.modalSecondaryButton}`}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={finish}
                  disabled={!canFinish}
                  className={`rounded-xl px-5 py-2.5 text-[14px] font-semibold ${classes.wizardPrimaryBtn}`}
                >
                  Finish
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
