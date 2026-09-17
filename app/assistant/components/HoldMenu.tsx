'use client';

import React, { useEffect, useRef, useState } from 'react';

/** Right-click context menu for a date pill/reschedule button — lets the user put a task on Hold. */
export function HoldMenu({
  x,
  y,
  isOnHold,
  onToggleHold,
  onClose,
}: {
  x: number;
  y: number;
  isOnHold: boolean;
  onToggleHold: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[170px] py-1 rounded-lg overflow-hidden text-[12px] shadow-lg"
      style={{
        left: pos.left,
        top: pos.top,
        background: 'var(--assistant-panel-bg, var(--assistant-surface))',
        border: '1px solid var(--assistant-border-soft)',
        backdropFilter: 'var(--assistant-panel-blur, none)',
      }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
        style={{ color: 'var(--assistant-text)' }}
        onClick={() => {
          onToggleHold();
          onClose();
        }}
      >
        <span aria-hidden>{isOnHold ? '▶️' : '⏸️'}</span>
        {isOnHold ? 'Remove Hold' : 'Put on Hold'}
      </button>
    </div>
  );
}
