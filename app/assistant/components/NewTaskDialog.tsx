'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';

export type NewTaskListOption = {
  projectId: string;
  projectTitle: string;
  listId: string;
  title: string;
};

/** Where the task goes: an existing list, or a new list (in the selected group) named `newListName`. */
export type NewTaskTarget =
  | { kind: 'list'; projectId: string; listId: string }
  | { kind: 'new'; newListName: string };

type Option =
  | { kind: 'list'; key: string; list: NewTaskListOption }
  | { kind: 'new'; key: string; name: string };

/**
 * "New task" form: the task's text + a searchable list picker (type to filter,
 * ↑/↓ + Enter to pick). When nothing matches, the picker offers to create the list.
 */
export function NewTaskDialog({
  lists,
  defaultListId,
  onCancel,
  onSubmit,
}: {
  lists: NewTaskListOption[];
  defaultListId?: string;
  onCancel: () => void;
  onSubmit: (text: string, target: NewTaskTarget) => void;
}) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Option | null>(() => {
    const l = lists.find(x => x.listId === defaultListId);
    return l ? { kind: 'list', key: l.listId, list: l } : null;
  });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { textRef.current?.focus(); }, []);

  const showGroups = new Set(lists.map(l => l.projectId)).size > 1;

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = lists
      .filter(l => !q || l.title.toLowerCase().includes(q) || (showGroups && l.projectTitle.toLowerCase().includes(q)))
      .map(l => ({ kind: 'list' as const, key: l.listId, list: l }));
    const exact = lists.some(l => l.title.trim().toLowerCase() === q);
    return q && !exact ? [...matches, { kind: 'new' as const, key: '__new__', name: query.trim() }] : matches;
  }, [lists, query, showGroups]);

  // Keep the highlighted option in range and in view
  useEffect(() => { setActive(a => Math.min(a, Math.max(0, options.length - 1))); }, [options.length]);
  useEffect(() => {
    listboxRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (o: Option) => {
    setPicked(o);
    setQuery('');
    setOpen(false);
  };

  const canSubmit = text.trim() !== '' && picked !== null;
  const submit = () => {
    if (!canSubmit || !picked) return;
    onSubmit(
      text.trim(),
      picked.kind === 'list'
        ? { kind: 'list', projectId: picked.list.projectId, listId: picked.list.listId }
        : { kind: 'new', newListName: picked.name },
    );
  };

  const pickedLabel = !picked
    ? ''
    : picked.kind === 'new'
    ? `New list: ${picked.name}`
    : showGroups ? `${picked.list.projectTitle} › ${picked.list.title}` : picked.list.title;

  const onPickerKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      // Open with a highlighted option → pick it; otherwise Enter saves
      if (open && options[active]) choose(options[active]);
      else submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (open) setOpen(false); else onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      <button type="button" className={`absolute inset-0 ${classes.modalBackdrop}`} onClick={onCancel} aria-label="Close" />
      <div role="dialog" aria-label="New task" className={`relative w-[92vw] max-w-md ${classes.modalCard}`}>
        <div className={classes.modalHeader}>
          <div className={classes.modalTitle}>New task</div>
        </div>

        <div className="space-y-3 px-6 pt-4">
          <label className="block">
            <div className="mb-1 text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>Task</div>
            <input
              ref={textRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // No list yet → Enter moves on to the picker
                  if (picked) submit(); else { pickerRef.current?.focus(); setOpen(true); }
                }
                if (e.key === 'Escape') onCancel();
              }}
              className={`w-full rounded-md px-3 py-2 text-[13px] ${classes.quickSearchInput}`}
            />
          </label>

          <div>
            <div className="mb-1 text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>List</div>
            <div className="relative">
              <input
                ref={pickerRef}
                role="combobox"
                aria-expanded={open}
                aria-controls="new-task-list-options"
                aria-autocomplete="list"
                value={open ? query : pickedLabel}
                onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
                onFocus={() => { setQuery(''); setOpen(true); setActive(0); }}
                onBlur={() => setOpen(false)}
                onKeyDown={onPickerKey}
                placeholder={picked ? pickedLabel : 'Search lists…'}
                className={`w-full rounded-md px-3 py-2 pr-8 text-[13px] ${classes.quickSearchInput}`}
              />
              <svg viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--assistant-text-faint)' }} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
              </svg>
              {open && (
                <div
                  ref={listboxRef}
                  id="new-task-list-options"
                  role="listbox"
                  className="yt-surface absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-xl p-1"
                  // Keep the focus in the input so the click lands before blur closes the list
                  onMouseDown={e => e.preventDefault()}
                >
                  {options.length === 0 ? (
                    <div className="px-2 py-2 text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>
                      No lists yet — type a name to create one.
                    </div>
                  ) : options.map((o, i) => (
                    <div
                      key={o.key}
                      data-idx={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o)}
                      className={`cursor-pointer rounded-lg px-2 py-1.5 text-[13px] break-words ${classes.quickModalListItem}`}
                      style={{
                        color: o.kind === 'new' ? 'var(--assistant-accent)' : 'var(--assistant-text-soft)',
                        background: i === active ? 'var(--assistant-control-bg)' : undefined,
                      }}
                    >
                      {o.kind === 'new' ? (
                        <>+ Create list &ldquo;{o.name}&rdquo;</>
                      ) : (
                        <>
                          {showGroups && (
                            <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-text-faint)' }}>
                              {o.list.projectTitle}
                            </span>
                          )}
                          {o.list.title}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`${classes.modalFooter} justify-end`}>
          <button type="button" onClick={onCancel} className={`rounded-md px-3 py-2 text-[13px] ${classes.quickModalSecondary}`}>Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={`rounded-md px-3 py-2 text-[13px] disabled:opacity-40 ${classes.quickModalPrimary}`}
          >
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}
