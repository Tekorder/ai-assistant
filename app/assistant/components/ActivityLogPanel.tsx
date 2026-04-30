'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type ActivityTask = {
  id: string;
  text: string;
  date: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  tasks: ActivityTask[];
  variant?: 'overlay' | 'dock';
};

function monthKeyFromYMD(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  return ymd.slice(0, 7);
}

function monthLabel(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, 1);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(dt);
}

function dateLabel(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || 'No date';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(dt);
}

export default function ActivityLogPanel({ open, onClose, tasks, variant = 'overlay' }: Props) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const [query, setQuery] = useState('');

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(t => (t.text || '').toLowerCase().includes(q));
  }, [tasks, query]);

  const months = useMemo(() => {
    const grouped = new Map<string, ActivityTask[]>();
    for (const t of filteredTasks) {
      const key = monthKeyFromYMD(t.date);
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(t);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({
        key,
        label: monthLabel(key),
        items: items.sort((a, b) => b.date.localeCompare(a.date)),
      }));
  }, [filteredTasks]);

  const [monthIndex, setMonthIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setMonthIndex(0);
    setQuery('');
  }, [open]);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }
    if (!shouldRender) return;
    setIsClosing(true);
    const t = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, 260);
    return () => window.clearTimeout(t);
  }, [open, shouldRender]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const requestClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, 220);
  };

  if (!shouldRender) return null;

  const current = months[monthIndex];
  const canGoOlder = monthIndex < months.length - 1;
  const canGoNewer = monthIndex > 0;

  const panelBody = (
    <div
      className="flex h-full w-full flex-col overflow-hidden text-white"
      style={{
        animation: isClosing
          ? 'activityPanelOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
          : 'activityPanelIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both',
        background:
          variant === 'overlay'
            ? 'rgba(8,8,8,0.42)'
            : 'rgba(8,8,8,0.42)',
        backdropFilter: 'blur(16px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
        borderLeft:
          variant === 'overlay'
            ? '1px solid color-mix(in srgb, var(--assistant-tone-1, #52b352) 50%, transparent)'
            : undefined,
        border:
          variant === 'dock'
            ? '1px solid color-mix(in srgb, var(--assistant-tone-1, #52b352) 50%, transparent)'
            : undefined,
        boxShadow:
          variant === 'overlay'
            ? '-2px 0 18px rgba(0,0,0,.18), inset 1px 0 0 rgba(255,255,255,.05)'
            : 'inset 0 1px 0 rgba(255,255,255,.06), 0 6px 16px rgba(0,0,0,.14)',
      }}
    >
      <style>{`
        @keyframes activityPanelIn {
          from { transform: translateX(-34px); opacity: 0; filter: blur(1px); }
          60% { transform: translateX(3px); opacity: .92; filter: blur(0); }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes activityPanelOut {
          from { transform: translateX(0); opacity: 1; filter: blur(0); }
          to { transform: translateX(14px); opacity: 0; filter: blur(1px); }
        }
      `}</style>

      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 shrink-0">
        <h2 className="text-[15px] font-semibold text-white/90">Activity Log</h2>
        <button
          type="button"
          onClick={requestClose}
          className="h-8 w-8 rounded-lg text-white/50 hover:text-white hover:bg-white/12 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => canGoOlder && setMonthIndex(i => i + 1)}
            disabled={!canGoOlder}
            className="text-[14px] px-2 py-1 rounded-md bg-white/10 text-white/70 disabled:opacity-30 hover:bg-white/16"
          >
            &lt;
          </button>
          <div className="text-[13px] font-semibold text-white/85">{current ? current.label : 'No activity'}</div>
          <button
            type="button"
            onClick={() => canGoNewer && setMonthIndex(i => i - 1)}
            disabled={!canGoNewer}
            className="text-[14px] px-2 py-1 rounded-md bg-white/10 text-white/70 disabled:opacity-30 hover:bg-white/16"
          >
            &gt;
          </button>
        </div>
        <div className="mt-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search completed tasks..."
            className="w-full bg-black/20 border border-white/10 rounded-md text-white/85 text-[12px] px-3 py-2 outline-none hover:bg-black/25 focus:border-white/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!current ? (
          <div className="text-[12px] text-white/45">No completed tasks yet.</div>
        ) : (
          <div className="space-y-2">
            {current.items.map(item => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-[13px] text-white/85">{item.text || '(untitled task)'}</div>
                <div className="mt-1 text-[11px] text-white/45">{dateLabel(item.date)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (variant === 'dock') {
    return panelBody;
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[200] bg-black/55"
        onClick={requestClose}
        aria-label="Close activity log"
        style={{
          animation: isClosing
            ? 'activityOverlayOut 0.2s ease-out both'
            : 'activityOverlayIn 0.22s ease-out both',
        }}
      />
      <div className="fixed top-0 right-0 h-full z-[201] w-full max-w-md overflow-hidden">
        <style>{`
          @keyframes activityOverlayIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes activityOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        `}</style>
        {panelBody}
      </div>
    </>
  );
}
