'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getTaskFlag, type TaskFlagColor } from '@/lib/datacenter';
import { TaskFlagBadge } from './TaskFlag';
import classes from '@/app/assistant/_theme/themes.module.css';
import { AgendaListHeader, AgendaListTitle, AgendaTaskRow, AgendaCheck, AgendaTaskText, AgendaDate } from './AgendaList';

export type PivotTreeRow = {
  key: string;
  blockId: string;
  text: string;
  indent: number;
  isMatch: boolean;
  checked?: boolean;
  deadline?: string;
  flag?: TaskFlagColor;
};

function isWordChar(ch: string) {
  return /[A-Za-z0-9_\u00C0-\u017F]/.test(ch);
}

export function extractWordAt(text: string, start: number, end: number) {
  const s = text ?? '';
  if (!s.trim()) return '';

  if (end > start) {
    const sel = s.slice(start, end).trim();
    if (sel) return sel;
  }

  let i = Math.max(0, Math.min(start, s.length));
  if (s.length === 0) return '';
  if (i === s.length) i = s.length - 1;

  if (!isWordChar(s[i])) {
    let L = i;
    while (L > 0 && !isWordChar(s[L])) L--;
    if (isWordChar(s[L])) i = L;
    else {
      let R = i;
      while (R < s.length && !isWordChar(s[R])) R++;
      if (R < s.length && isWordChar(s[R])) i = R;
      else return '';
    }
  }

  let left = i;
  while (left > 0 && isWordChar(s[left - 1])) left--;

  let right = i + 1;
  while (right < s.length && isWordChar(s[right])) right++;

  return s.slice(left, right).trim();
}

function includesWord(haystack: string, needle: string) {
  const h = (haystack || '').toLowerCase();
  const n = (needle || '').trim().toLowerCase();
  if (!n) return false;
  return h.includes(n);
}

function isUncTitleBlock(text: string, indent: number, uncTitle?: string) {
  if (!uncTitle) return false;
  return indent === 0 && (text || '').trim().toLowerCase() === uncTitle.trim().toLowerCase();
}

export function buildPrunedPivotTree<T extends { id: string; text: string; indent: number; checked?: boolean; deadline?: string; archived?: boolean; flag?: TaskFlagColor; priority?: boolean }>(
  blocks: T[],
  word: string,
  opts?: { uncTitle?: string },
): PivotTreeRow[] {
  const w = (word || '').trim().toLowerCase();
  if (!w) return [];

  const include = new Set<number>();

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;
    if (!(b.indent > 0)) continue;
    if (b.archived === true) continue;
    if (!includesWord(b.text || '', w)) continue;

    include.add(i);

    let curIndent = b.indent;
    let foundTitle = false;

    for (let j = i - 1; j >= 0; j--) {
      const prev = blocks[j];
      if (!prev) continue;

      if (prev.indent < curIndent) {
        include.add(j);
        curIndent = prev.indent;

        if (curIndent === 0) {
          foundTitle = true;
          break;
        }
      }
    }

    if (!foundTitle) {
      for (let j = i - 1; j >= 0; j--) {
        const prev = blocks[j];
        if (prev?.indent === 0) {
          include.add(j);
          break;
        }
      }
    }
  }

  const rows: PivotTreeRow[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (!include.has(i)) continue;
    const b = blocks[i];
    if (!b) continue;

    if (isUncTitleBlock(b.text, b.indent, opts?.uncTitle)) continue;

    rows.push({
      key: `${b.id}_${i}`,
      blockId: b.id,
      text: b.text ?? '',
      indent: b.indent ?? 0,
      isMatch: b.indent > 0 && includesWord(b.text || '', w),
      checked: b.indent > 0 ? Boolean(b.checked) : undefined,
      deadline: b.indent > 0 ? b.deadline : undefined,
      flag: b.indent > 0 ? getTaskFlag(b) : undefined,
    });
  }

  return rows;
}

/** All tasks under a list block (indent 0) until the next list — for list-title pivot. */
export function buildListPivotTree<T extends { id: string; text: string; indent: number; checked?: boolean; deadline?: string; archived?: boolean; flag?: TaskFlagColor; priority?: boolean }>(
  blocks: T[],
  listBlockId: string,
  opts?: { uncTitle?: string },
): PivotTreeRow[] {
  const i0 = blocks.findIndex((b) => b.id === listBlockId && b.indent === 0);
  if (i0 < 0) return [];

  const listBlock = blocks[i0];
  if (isUncTitleBlock(listBlock.text ?? '', listBlock.indent ?? 0, opts?.uncTitle)) return [];

  const rows: PivotTreeRow[] = [];

  rows.push({
    key: `${listBlock.id}_listtitle`,
    blockId: listBlock.id,
    text: listBlock.text ?? '',
    indent: 0,
    isMatch: true,
    checked: undefined,
    deadline: undefined,
  });

  for (let i = i0 + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.indent === 0) break;
    if (b.archived === true) continue;

    rows.push({
      key: `${b.id}_${i}`,
      blockId: b.id,
      text: b.text ?? '',
      indent: b.indent ?? 1,
      isMatch: false,
      checked: b.indent > 0 ? Boolean(b.checked) : undefined,
      deadline: b.indent > 0 ? b.deadline : undefined,
      flag: b.indent > 0 ? getTaskFlag(b) : undefined,
    });
  }

  return rows;
}


export type PivotPanelProps = {
  open: boolean;
  variant?: 'dock' | 'overlay';
  word: string;
  /** Keyword search vs whole list subtree */
  pivotKind?: 'word' | 'list';
  rows: PivotTreeRow[];
  onClose: () => void;
  onGoTo: (blockId: string) => void;
  onToggleTask?: (blockId: string, nextChecked: boolean) => void;
};

function PivotPanelBody(props: Omit<PivotPanelProps, 'open' | 'variant'>) {
  const { word, pivotKind = 'word', rows, onClose, onGoTo, onToggleTask } = props;
  const [showCompleted, setShowCompleted] = useState(false);

  const visibleRows = useMemo(() => {
    if (showCompleted) return rows;
    return rows.filter((r) => {
      if (r.indent === 0) return true;
      return !r.checked;
    });
  }, [rows, showCompleted]);

  const hasHiddenCompleted = useMemo(() => {
    return rows.some((r) => r.indent > 0 && r.checked === true);
  }, [rows]);

  const hasRows = visibleRows && visibleRows.length > 0;

  // Same layout as Agenda (list title + rule, task rows); clicking a row goes to the task.
  // The keyword's matches are underlined.
  const renderRows = useMemo(() => {
    const matchStyle = (isMatch: boolean): React.CSSProperties | undefined => (isMatch
      ? { textDecoration: 'underline', textUnderlineOffset: 4, textDecorationColor: 'color-mix(in srgb, var(--assistant-accent) 65%, transparent)' }
      : undefined);
    const goTo = (blockId: string) => ({
      role: 'button',
      tabIndex: 0,
      title: 'Go to task',
      onClick: () => onGoTo(blockId),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onGoTo(blockId);
        }
      },
    });

    return visibleRows.map((r) => (r.indent === 0 ? (
      <AgendaListHeader
        key={r.key}
        {...goTo(r.blockId)}
        className="cursor-pointer"
        heading={<AgendaListTitle><span style={matchStyle(r.isMatch)}>{r.text || '—'}</span></AgendaListTitle>}
      />
    ) : (
      <AgendaTaskRow
        key={r.key}
        {...goTo(r.blockId)}
        className="cursor-pointer rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--assistant-text)_5%,transparent)]"
        indent={r.indent}
        check={
          <AgendaCheck
            checked={Boolean(r.checked)}
            onToggle={onToggleTask ? () => onToggleTask(r.blockId, !r.checked) : undefined}
          />
        }
        right={r.flag ? <TaskFlagBadge source={{ flag: r.flag }} /> : null}
      >
        <AgendaTaskText checked={Boolean(r.checked)} style={matchStyle(r.isMatch)}>{r.text || '—'}</AgendaTaskText>
        <AgendaDate ymd={r.deadline} />
      </AgendaTaskRow>
    )));
  }, [visibleRows, onGoTo, onToggleTask]);

  return (
    <>
      <div className="flex h-[49px] shrink-0 items-center gap-2 px-4" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--assistant-accent)' }}>{pivotKind === 'list' ? 'List' : 'Keyword'}</span>
          <h2 className="min-w-0 break-words text-[16px] font-semibold leading-tight" style={{ color: 'var(--assistant-text)' }} title={word}>&ldquo;{word}&rdquo;</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`h-8 w-8 shrink-0 rounded-lg ${classes.panelCloseBtn}`}
          aria-label="Close keyword panel"
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
        {hasRows ? (
          <div className="space-y-1">{renderRows}</div>
        ) : (
          <div className="px-2 py-2 text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>
            {pivotKind === 'list'
              ? rows.length > 0 && !showCompleted
                ? 'No unchecked tasks in this list.'
                : 'No tasks in this list.'
              : (
                <>
                  No tasks found containing &ldquo;{word}&rdquo;
                </>
              )}
          </div>
        )}
      </div>

      {hasHiddenCompleted ? (
        <div className="flex shrink-0 px-4 py-2" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className={`w-full px-2.5 py-2 text-[12px] font-medium rounded-lg ${classes.panelBtn}`}
          >
            {showCompleted ? 'Hide completed' : 'Show completed'}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** Keyword tree: dock (column) or overlay (mobile sheet). */
export function PivotPanel({
  open,
  variant = 'overlay',
  word,
  pivotKind = 'word',
  rows,
  onClose,
  onGoTo,
  onToggleTask,
}: PivotPanelProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  const requestClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, 220);
  };

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
      if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  if (!shouldRender) return null;

  const body = (
    <PivotPanelBody
      word={word}
      pivotKind={pivotKind}
      rows={rows}
      onClose={requestClose}
      onGoTo={onGoTo}
      onToggleTask={onToggleTask}
    />
  );

  if (variant === 'dock') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={word ? `Keyword: ${word}` : 'Keyword'}
        className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
        style={{
          color: 'var(--assistant-text)',
          animation: isClosing
            ? 'pivotFadeOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
            : 'pivotFadeInLeft 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both',
        }}
      >
        <style>{`
          @keyframes pivotFadeInLeft {
            from { opacity: 0; transform: translateX(-34px); filter: blur(1px); }
            60% { opacity: .92; transform: translateX(3px); filter: blur(0); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes pivotFadeOut {
            from { opacity: 1; transform: translateX(0); filter: blur(0); }
            to { opacity: 0; transform: translateX(14px); filter: blur(1px); }
          }
        `}</style>
        {body}
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes pivotFadeInLeft {
          from { transform: translateX(-34px); opacity: 0; filter: blur(1px); }
          60% { transform: translateX(3px); opacity: .92; filter: blur(0); }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes pivotFadeOut {
          from { transform: translateX(0); opacity: 1; filter: blur(0); }
          to { transform: translateX(14px); opacity: 0; filter: blur(1px); }
        }
        @keyframes pivotOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pivotOverlayOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
      <button
        type="button"
        className="fixed inset-0 z-[200]"
        onClick={requestClose}
        aria-label="Close keyword panel"
        style={{
          background: 'var(--assistant-overlay)',
          animation: isClosing
            ? 'pivotOverlayOut 0.2s ease-out both'
            : 'pivotOverlayIn 0.22s ease-out both',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={word ? `Keyword: ${word}` : 'Keyword'}
        className={`fixed left-3 top-3 z-[201] flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl ${classes.panelGlass} ${classes.panelOverlay}`}
        style={{
          color: 'var(--assistant-text)',
          animation: isClosing
            ? 'pivotFadeOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
            : 'pivotFadeInLeft 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both',
        }}
      >
        {body}
      </div>
    </>
  );
}
