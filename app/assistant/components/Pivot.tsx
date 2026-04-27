'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

export type PivotTreeRow = {
  key: string;
  blockId: string;
  text: string;
  indent: number;
  isMatch: boolean;
  checked?: boolean;
  deadline?: string;
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

export function buildPrunedPivotTree<T extends { id: string; text: string; indent: number; checked?: boolean; deadline?: string; archived?: boolean }>(
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
    });
  }

  return rows;
}

/** All tasks under a list block (indent 0) until the next list — for list-title pivot. */
export function buildListPivotTree<T extends { id: string; text: string; indent: number; checked?: boolean; deadline?: string; archived?: boolean }>(
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
    });
  }

  return rows;
}

const dockShell: React.CSSProperties = {
  background: 'rgba(8,8,8,0.42)',
  backdropFilter: 'blur(16px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
  border: '1px solid rgba(82,179,82,.5)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
};

export type PivotPanelProps = {
  open: boolean;
  variant?: 'dock' | 'overlay';
  word: string;
  /** Keyword search vs whole list subtree */
  pivotKind?: 'word' | 'list';
  rows: PivotTreeRow[];
  onClose: () => void;
  onGoTo: (blockId: string) => void;
  pillText: (r: PivotTreeRow) => string;
  pillClass: (r: PivotTreeRow) => string;
  onToggleTask?: (blockId: string, nextChecked: boolean) => void;
};

function PivotPanelBody(props: Omit<PivotPanelProps, 'open' | 'variant'>) {
  const { word, pivotKind = 'word', rows, onClose, onGoTo, pillText, pillClass, onToggleTask } = props;
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

  const renderRows = useMemo(() => {
    return visibleRows.map((r) => {
      const isTitle = r.indent === 0;
      const pill = !isTitle ? pillText(r) : '';
      const leftPad = isTitle ? 6 : Math.min(40, 10 + r.indent * 16);

      return (
        <div
          key={r.key}
          role="button"
          tabIndex={0}
          onClick={() => onGoTo(r.blockId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onGoTo(r.blockId);
            }
          }}
          className="group flex w-full box-border cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/5"
          title="Go to task"
          style={{ paddingLeft: leftPad }}
        >
          <div className="relative flex w-6 shrink-0 items-center">
            <div className="absolute bottom-0 left-3 top-0 w-px bg-white/12" />
            <div className="absolute left-3 top-1/2 h-px w-3 bg-white/12" />
            <div className="absolute left-[18px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/25" />
          </div>

          {isTitle ? (
            <div className="h-4 w-4 shrink-0" />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleTask?.(r.blockId, !Boolean(r.checked));
              }}
              className={[
                'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border',
                onToggleTask ? 'cursor-pointer' : 'cursor-default',
                r.checked ? 'border-emerald-400/70 bg-emerald-500/15' : 'border-white/25',
              ].join(' ')}
              title={r.checked ? 'Completed' : 'Not completed'}
            >
              {r.checked ? <span className="text-xs text-emerald-300">✓</span> : null}
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div
              className={[
                'text-[13px] whitespace-normal break-words',
                isTitle ? 'font-semibold text-white/75' : '',
                !isTitle && r.checked ? 'text-white/40 line-through' : '',
                !isTitle && !r.checked ? 'text-white/90' : '',
                r.isMatch ? 'underline decoration-[#d5fc43]/65 underline-offset-4' : '',
              ].join(' ')}
            >
              {r.text || '—'}
            </div>
          </div>

          {!isTitle ? (
            <div className="shrink-0">
              <div
                className={['rounded-full border px-2 py-1 text-[11px]', pillClass(r)].join(' ')}
                title={r.deadline ? `Date: ${r.deadline}` : 'No date'}
              >
                {pill ? pill : '📅'}
              </div>
            </div>
          ) : null}
        </div>
      );
    });
  }, [visibleRows, onGoTo, onToggleTask, pillText, pillClass]);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#d5fc43]/75">Pivot</div>
          <h2 className="text-[15px] font-semibold leading-tight text-white/90">&ldquo;{word}&rdquo;</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 rounded-lg text-white/50 transition-colors hover:bg-white/12 hover:text-white"
          aria-label="Close pivot"
          title="Close pivot"
        >
          ✕
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2">
        <div className="min-w-0 text-[11px] text-white/35">
          {pivotKind === 'list'
            ? 'List pivot: all tasks under this list. Click a row to jump.'
            : 'Click a word in Daily (Tasks) to add a Pivot. Click a row to jump.'}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
        {hasRows ? (
          <div className="space-y-1">{renderRows}</div>
        ) : (
          <div className="px-2 py-2 text-[12px] text-white/40">
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
        <div className="flex shrink-0 border-t border-white/[0.06] px-4 py-2">
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="w-full rounded-lg border border-white/12 bg-white/5 px-2.5 py-2 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
  pillText,
  pillClass,
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
      pillText={pillText}
      pillClass={pillClass}
    />
  );

  if (variant === 'dock') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={word ? `Pivot: ${word}` : 'Pivot'}
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl text-white"
        style={{
          ...dockShell,
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
      <button
        type="button"
        className="fixed inset-0 z-[200] bg-black/35"
        onClick={requestClose}
        aria-label="Close pivot"
        style={{
          animation: isClosing
            ? 'pivotOverlayOut 0.2s ease-out both'
            : 'pivotOverlayIn 0.22s ease-out both',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={word ? `Pivot: ${word}` : 'Pivot'}
        className="fixed right-0 top-0 z-[201] flex h-full w-full max-w-md flex-col overflow-hidden text-white"
        style={{
          animation: isClosing
            ? 'pivotFadeOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
            : 'pivotFadeInLeft 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both',
          background: 'transparent',
          borderLeft: '1px solid rgba(82,179,82,.5)',
          boxShadow: '-4px 0 60px rgba(0,0,0,.4), inset 1px 0 0 rgba(255,255,255,.05)',
        }}
      >
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
          @keyframes pivotOverlayIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes pivotOverlayOut {
            from { opacity: 1; }
            to { opacity: 0; }
          }
        `}</style>
        {body}
      </div>
    </>
  );
}
