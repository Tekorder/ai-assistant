'use client';
import React, { useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';

/** Names a new section; it goes first in the list, right under the list's title. */
export function NewSectionDialog({
  listName,
  zIndex = 999,
  onCancel,
  onCreate,
}: {
  listName?: string;
  zIndex?: number;
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmed) onCreate(trimmed);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex }}>
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onCancel} aria-label="Close" />
      <form
        role="dialog"
        aria-label="New section"
        onSubmit={submit}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
        className={`relative w-[92vw] max-w-md rounded-2xl shadow-2xl ${classes.quickModal}`}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--assistant-text)' }} htmlFor="new-section-name">
            New section
          </label>
          <input
            id="new-section-name"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            className={`w-full rounded-lg px-2 py-2 text-[13px] ${classes.quickSearchInput}`}
          />
        </div>
        <div className="px-4 py-3 flex flex-wrap items-center justify-end gap-2" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
          <button type="button" onClick={onCancel} className={`text-[13px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}>
            Cancel
          </button>
          <button type="submit" disabled={!trimmed} className={`text-[13px] font-semibold px-3 py-2 rounded-md disabled:opacity-50 ${classes.quickModalPrimary}`}>
            Create section
          </button>
        </div>
      </form>
    </div>
  );
}
