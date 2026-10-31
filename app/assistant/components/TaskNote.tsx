'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseYMD, todayYMD, uid, type TaskNoteEntry } from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';

type NoteTask = { text?: string; notes?: TaskNoteEntry[] };

/** Every note change goes through here: the full list, newest first (undefined = no notes left) */
type NotesChange = (notes: TaskNoteEntry[] | undefined) => void;

/** "Oct 30", plus the year when it isn't this year ("Oct 30, 2025") */
function formatNoteDate(ymd: string) {
  const d = parseYMD(ymd);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Note button on a task row — stays visible while the task has notes; opens the notes modal. */
export function TaskNoteButton({
  task,
  onChange,
  className = '',
}: {
  task: NoteTask;
  onChange: NotesChange;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const notes = task.notes ?? [];
  const hasNote = notes.length > 0;
  const label = hasNote
    ? notes.length === 1 ? notes[0].text.trim() : `${notes.length} notes · latest: ${notes[0].text.trim()}`
    : 'Add note';

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={hasNote ? 'Notes' : 'Add note'}
        data-tip={label}
        className={[
          'relative z-10 shrink-0 h-4 w-4 flex items-center justify-center select-none transition-all duration-150',
          hasNote
            ? 'opacity-90 hover:opacity-100'
            : 'opacity-0 group-hover:opacity-40 hover:!opacity-80 hover:scale-110',
          className,
        ].join(' ')}
        style={{ color: hasNote ? 'var(--assistant-accent)' : 'var(--assistant-text)' }}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 2.5h7l3 3v8H3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 2.5v3h3M5.5 8.5h5M5.5 11h3.5" />
        </svg>
      </button>

      {open ? <TaskNoteModal task={task} onChange={onChange} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Modal with a task's notes (mount it to open it): a box to add one on top, then every
 * note dated, newest first — each can be edited or deleted. Changes save right away.
 */
export function TaskNoteModal({
  task,
  onChange,
  onClose,
}: {
  task: NoteTask;
  onChange: NotesChange;
  onClose: () => void;
}) {
  // Local copy so the list reacts at once; every change is also sent up
  const [notes, setNotes] = useState<TaskNoteEntry[]>(task.notes ?? []);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape leaves an edit first, then the modal
      if (editing) setEditing(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, onClose]);

  const commit = (next: TaskNoteEntry[]) => {
    setNotes(next);
    onChange(next.length ? next : undefined);
  };

  const addNote = () => {
    if (!draft.trim()) return;
    commit([{ id: uid(), text: draft.trim(), date: todayYMD() }, ...notes]);
    setDraft('');
  };

  const saveEdit = () => {
    if (!editing) return;
    const text = editing.text.trim();
    // Emptied out → same as deleting it
    commit(text ? notes.map(n => (n.id === editing.id ? { ...n, text } : n)) : notes.filter(n => n.id !== editing.id));
    setEditing(null);
  };

  const iconBtn = 'grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--assistant-hover-bg)]';

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center">
      <button
        type="button"
        className={`absolute inset-0 ${classes.modalBackdrop}`}
        onClick={onClose}
        aria-label="Close"
      />
      <div
        role="dialog"
        aria-label="Notes"
        className={`relative flex max-h-[85vh] w-[92vw] max-w-md flex-col ${classes.modalCard}`}
      >
        <div className={`flex items-start justify-between gap-3 ${classes.modalHeader}`}>
          <div className="min-w-0">
            <div className={classes.modalTitle}>Notes</div>
            {(task.text || '').trim() ? (
              <div className="mt-1 break-words text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
                {task.text}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`-mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${classes.panelCloseBtn}`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* New note */}
        <form className="px-6 pt-4" onSubmit={(e) => { e.preventDefault(); addNote(); }}>
          <textarea
            autoFocus
            value={draft}
            placeholder="Write a note…"
            onChange={e => setDraft(e.target.value)}
            // Ctrl/Cmd+Enter adds; plain Enter keeps adding lines
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addNote(); } }}
            rows={3}
            className={`block w-full resize-y rounded-lg px-3 py-2 text-[14px] leading-[1.45] outline-none ${classes.panelInput}`}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-md px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
            >
              Add
            </button>
          </div>
        </form>

        {/* Saved notes as a timeline, newest first: a dot per note on one rail, the date
            written once per day above its notes */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
          {notes.length === 0 ? (
            <div className="py-2 text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>No notes yet</div>
          ) : (
            <ol className="relative">
              {notes.map((n, i) => {
                const isEditing = editing?.id === n.id;
                const isLast = i === notes.length - 1;
                const newDay = i === 0 || notes[i - 1].date !== n.date;
                return (
                  <li key={n.id} className={`group relative pl-7 ${isLast ? '' : 'pb-4'}`}>
                    {/* Rail down to the next note */}
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 left-[5px] top-3 w-px"
                        style={{ background: 'var(--assistant-border-soft)' }}
                      />
                    )}
                    {/* Dot: filled for the newest note, hollow for older ones */}
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full"
                      style={{
                        border: '2px solid var(--assistant-accent)',
                        background: i === 0 ? 'var(--assistant-accent)' : 'var(--assistant-panel-bg)',
                      }}
                    />
                    {/* Day label, once per day; later notes of the same day sit right under it */}
                    {newDay ? (
                      <div className="mb-0.5 text-[12px] font-semibold uppercase leading-[22px] tracking-wide" style={{ color: 'var(--assistant-text-muted)' }}>
                        {formatNoteDate(n.date)}
                      </div>
                    ) : null}
                    <div>
                      {!isEditing ? (
                        // Edit / delete on hover, top-right of the note
                        <div className="absolute right-0 top-0 flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => setEditing({ id: n.id, text: n.text })}
                            className={iconBtn}
                            style={{ color: 'var(--assistant-text-muted)' }}
                            aria-label="Edit note"
                            title="Edit"
                          >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10.8 2.7l2.5 2.5-7.6 7.6-3.1.6.6-3.1 7.6-7.6z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => commit(notes.filter(x => x.id !== n.id))}
                            className={`${iconBtn} hover:!text-[var(--assistant-danger-text)]`}
                            style={{ color: 'var(--assistant-text-muted)' }}
                            aria-label="Delete note"
                            title="Delete"
                          >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                              <path strokeLinecap="round" d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
                              <path strokeLinecap="round" d="M3.5 4.5l.75 8.25A1 1 0 0 0 5.25 13.5h5.5a1 1 0 0 0 1-.75L12.5 4.5" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {isEditing ? (
                      <div className="mt-1">
                        <textarea
                          autoFocus
                          value={editing.text}
                          onChange={e => setEditing({ id: n.id, text: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(); } }}
                          onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                          rows={3}
                          className={`block w-full resize-y rounded-md px-2 py-1.5 text-[14px] leading-[1.45] outline-none ${classes.panelInput}`}
                        />
                        <div className="mt-1.5 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className={`${classes.modalSecondaryButton} rounded-md px-3 py-1.5 text-[12px]`}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-opacity hover:opacity-90"
                            style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words pr-16 text-[14px] leading-[1.45]" style={{ color: 'var(--assistant-text-soft)' }}>
                        {n.text}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}
