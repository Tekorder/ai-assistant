'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LIST_STATUSES, type Block, type ListDisplayStatus } from '@/lib/datacenter';

export const LIST_STATUS_META: Record<ListDisplayStatus, { label: string; bg: string; fg: string; border: string }> = {
  in_progress: { label: 'In progress', bg: '#f59e0b', fg: '#ffffff', border: '#f59e0b' },
  on_hold:     { label: 'On hold',     bg: '#9ca3af', fg: '#ffffff', border: '#9ca3af' },
  completed:   { label: 'Completed',   bg: '#16a34a', fg: '#ffffff', border: '#16a34a' },
  someday:     { label: 'Someday',     bg: '#3b82f6', fg: '#ffffff', border: '#3b82f6' },
  archived:    { label: 'Archived',    bg: 'transparent', fg: '#6b7280', border: '#9ca3af' },
};

export function ListStatusPill({
  status,
  current,
  onChange,
}: {
  /** Displayed status (may be the auto "completed"). */
  status: ListDisplayStatus;
  /** Stored status on the list block. */
  current: Block['listStatus'];
  onChange: (next: Block['listStatus']) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const meta = LIST_STATUS_META[status];

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  return (
    <>
      <button
        type="button"
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setMenu(prev => (prev ? null : { x: r.left, y: r.bottom + 4 }));
        }}
        className="shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none"
        style={{ background: meta.bg, color: meta.fg, border: `1px solid ${meta.border}` }}
        title={status === 'completed' ? 'All tasks done — change status' : 'Change status'}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
      >
        {meta.label}
      </button>

      {menu ? createPortal(
        <div
          role="menu"
          className="fixed z-[10040] min-w-[140px] overflow-hidden rounded-lg py-1 shadow-xl"
          style={{
            left: menu.x,
            top: menu.y,
            background: 'var(--assistant-panel-bg)',
            border: '1px solid var(--assistant-border-soft)',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {LIST_STATUSES.map(s => {
            const m = LIST_STATUS_META[s];
            const isCurrent = (current ?? 'in_progress') === s;
            return (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                onClick={() => {
                  onChange(s === 'in_progress' ? undefined : s);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-black/5"
                style={{ color: 'var(--assistant-text)', fontWeight: isCurrent ? 600 : 400 }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.border }} />
                {m.label}
              </button>
            );
          })}
          <div
            className="mt-1 px-3 pb-1 pt-1.5 text-[11px] leading-snug"
            style={{ color: 'var(--assistant-text-faint)', borderTop: '1px solid var(--assistant-border-soft)' }}
          >
            Completed is set automatically when all tasks are done.
          </div>
        </div>,
        document.querySelector('[data-assistant-root]') ?? document.body,
      ) : null}
    </>
  );
}
