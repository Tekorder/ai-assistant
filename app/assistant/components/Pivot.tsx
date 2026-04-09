'use client';

import React, { useMemo } from 'react';

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
  opts?: { uncTitle?: string }
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

export function PivotModal(props: {
  open: boolean;
  word: string;
  rows: PivotTreeRow[];
  onClose: () => void;
  onGoTo: (blockId: string) => void;
  pillText: (r: PivotTreeRow) => string;
  pillClass: (r: PivotTreeRow) => string;
}) {
  const { open, word, rows, onClose, onGoTo, pillText, pillClass } = props;
  const hasRows = rows && rows.length > 0;

  const renderRows = useMemo(() => {
    return rows.map((r) => {
      const isTitle = r.indent === 0;
      const pill = !isTitle ? pillText(r) : '';
      const leftPad = isTitle ? 6 : Math.min(40, 10 + r.indent * 16);

      return (
        <button
          key={r.key}
          type="button"
          onClick={() => onGoTo(r.blockId)}
          className="w-full text-left group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5 transition-colors"
          title="Go to task"
          style={{ paddingLeft: leftPad }}
        >
          <div className="relative shrink-0 w-6 h-6 flex items-center">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-white/12" />
            <div className="absolute left-3 top-1/2 w-3 h-px bg-white/12" />
            <div className="absolute left-[18px] top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-white/25" />
          </div>

          {isTitle ? (
            <div className="h-4 w-4 shrink-0" />
          ) : (
            <div
              className={[
                'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                r.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25',
              ].join(' ')}
              title={r.checked ? 'Completed' : 'Not completed'}
            >
              {r.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div
              className={[
                'text-[13px] truncate',
                isTitle ? 'text-white/75 font-semibold' : '',
                !isTitle && r.checked ? 'text-white/40 line-through' : '',
                !isTitle && !r.checked ? 'text-white/90' : '',
                r.isMatch ? 'underline decoration-white/30 underline-offset-4' : '',
              ].join(' ')}
            >
              {r.text || '—'}
            </div>
          </div>

          {!isTitle ? (
            <div className="shrink-0">
              <div
                className={[
                  'text-[11px] px-2 py-1 rounded-full border',
                  pillClass(r),
                ].join(' ')}
                title={r.deadline ? `Date: ${r.deadline}` : 'No date'}
              >
                {pill ? pill : '📅'}
              </div>
            </div>
          ) : null}
        </button>
      );
    });
  }, [rows, onGoTo, pillText, pillClass]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={[
            'w-[min(720px,92vw)] rounded-2xl border border-white/10',
            'bg-gray-900/90 backdrop-blur-xl shadow-2xl shadow-black/40',
            'p-4',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-white font-semibold text-lg leading-tight">
                &ldquo;{word}&rdquo;
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/16 transition-all"
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
          </div>

          <div className="mt-3 rounded-xl p-2 max-h-[66vh] overflow-auto">
            {hasRows ? (
              <div className="space-y-1">{renderRows}</div>
            ) : (
              <div className="text-[12px] text-white/40 px-2 py-2">
                No tasks found containing &ldquo;{word}&rdquo;
              </div>
            )}
          </div>

          <div className="mt-3 text-[11px] text-white/35">
            Tip: doble click otra palabra (o seleccioná texto) y el modal se actualiza.
          </div>
        </div>
      </div>
    </div>
  );
}