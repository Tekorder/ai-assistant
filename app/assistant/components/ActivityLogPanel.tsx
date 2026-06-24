'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type TaskFlagColor } from '@/lib/datacenter';
import { TaskFlagBadge } from './TaskFlag';
import classes from '@/app/assistant/_theme/themes.module.css';
// test
type ActivityTask = {
  id: string;
  text: string;
  date: string;
  flag?: TaskFlagColor;
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

  const panelAnim = isClosing
    ? 'activityPanelOut 0.22s cubic-bezier(0.4, 0, 1, 1) both'
    : 'activityPanelIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both';

  const body = (
    <>
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Activity Log</h2>
        <button
          type="button"
          onClick={requestClose}
          className={`h-8 w-8 rounded-lg ${classes.panelBtn}`}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => canGoOlder && setMonthIndex(i => i + 1)}
            disabled={!canGoOlder}
            className={`text-[14px] px-2 py-1 rounded-md ${classes.panelBtn}`}
          >
            &lt;
          </button>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>
            {current ? current.label : 'No activity'}
          </div>
          <button
            type="button"
            onClick={() => canGoNewer && setMonthIndex(i => i - 1)}
            disabled={!canGoNewer}
            className={`text-[14px] px-2 py-1 rounded-md ${classes.panelBtn}`}
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
            className={`w-full rounded-md text-[12px] px-3 py-2 ${classes.panelInput}`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!current ? (
          <div className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>No completed tasks yet.</div>
        ) : (
          <div className="space-y-2">
            {current.items.map(item => (
              <div key={item.id} className="rounded-xl px-3 py-2"
                style={{
                  border: '1px solid var(--assistant-border-soft)',
                  background: 'var(--assistant-surface)',
                }}>
                <div className="text-[13px]" style={{ color: 'var(--assistant-text-soft)' }}>
                  <TaskFlagBadge source={{ flag: item.flag }} inline />
                  {item.text || '(untitled task)'}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: 'var(--assistant-text-faint)' }}>
                  {dateLabel(item.date)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (variant === 'dock') {
    return (
      <div
        className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        {body}
      </div>
    );
  }

  return (
    <>
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
        @keyframes activityOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes activityOverlayOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
      <button
        type="button"
        className="fixed inset-0 z-200"
        onClick={requestClose}
        aria-label="Close activity log"
        style={{
          background: 'var(--assistant-overlay)',
          animation: isClosing
            ? 'activityOverlayOut 0.2s ease-out both'
            : 'activityOverlayIn 0.22s ease-out both',
        }}
      />
      <div
        className={`fixed right-3 top-3 z-201 flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        {body}
      </div>
    </>
  );
}
