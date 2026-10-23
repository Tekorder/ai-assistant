'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import classes from '@/app/assistant/_theme/themes.module.css';

type NoteTask = { text?: string; note?: string };

/** Note button on a task row — stays visible while the task has a note; opens a modal to edit it. */
export function TaskNoteButton({
  task,
  onChange,
  className = '',
}: {
  task: NoteTask;
  onChange: (note: string | undefined) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasNote = Boolean((task.note || '').trim());

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={hasNote ? 'Edit note' : 'Add note'}
        title={hasNote ? (task.note || '').trim() : 'Add note'}
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

/** Modal to add, edit or delete a task's note (mount it to open it). */
export function TaskNoteModal({
  task,
  onChange,
  onClose,
}: {
  task: NoteTask;
  onChange: (note: string | undefined) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(task.note ?? '');
  const hasNote = Boolean((task.note || '').trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    onChange(draft.trim() ? draft : undefined);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close"
      />
      <form
        role="dialog"
        aria-label="Note"
        className="relative w-[92vw] max-w-md rounded-2xl shadow-2xl"
        style={{
          border: '1px solid var(--assistant-border-soft)',
          background: 'var(--assistant-panel-bg)',
        }}
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>Note</div>
          {(task.text || '').trim() ? (
            <div className="mt-1 break-words text-[12px]" style={{ color: 'var(--assistant-text-faint)' }} title={task.text}>
              {task.text}
            </div>
          ) : null}
        </div>

        <div className="px-4 py-4">
          <textarea
            autoFocus
            value={draft}
            placeholder="Add a note…"
            onChange={e => setDraft(e.target.value)}
            // Ctrl/Cmd+Enter saves; plain Enter keeps adding lines
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave(); } }}
            rows={6}
            className={`block w-full resize-y rounded-lg px-3 py-2 text-[14px] leading-[1.45] outline-none ${classes.panelInput}`}
          />
        </div>

        <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
          {hasNote ? (
            <button
              type="button"
              onClick={() => { onChange(undefined); onClose(); }}
              className="text-[13px] px-2 py-2 rounded-md transition-colors hover:!text-rose-400"
              style={{ color: 'var(--assistant-text-muted)' }}
            >
              Delete note
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`${classes.modalSecondaryButton} text-[13px] px-3 py-2 rounded-md`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[13px] font-semibold px-3 py-2 rounded-md transition-opacity hover:opacity-90"
              style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}
