'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  // Types
  type Block,
  // Constants
  LS_KEY_V2,
  LS_KEY_V1,
  // Utilities
  isValidDateYYYYMMDD,
  startOfLocalDay,
  todayYMD,
  toYMD,
  parseYMD,
  fmtColTitle,
  // Persistence
  readSelectedProject,
  writeSelectedProjectBlocks,
} from '@/lib/datacenter';

/* ===================== Local UI types (no van a datacenter) ===================== */

type SubTask = {
  id: string;
  text: string;
  checked: boolean;
};

type Card = {
  id: string;
  projectTitle: string;
  text: string;
  checked: boolean;
  deadline: string;
  subtasks: SubTask[];
  isHidden?: boolean;
  archived?: boolean;
};

/* ===================== Constants ===================== */

const OVERDUE_KEY = '__OVERDUE__';

/* ===================== Helpers (UI-only, no pertenecen a datacenter) ===================== */

function dayDiffFromToday(ymd: string): number {
  const target = startOfLocalDay(parseYMD(ymd));
  const today = startOfLocalDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function pillClass(diff: number): string {
  if (diff < 0) return 'yt-pill yt-pill-overdue';
  if (diff === 0) return 'yt-pill yt-pill-today';
  if (diff === 1) return 'yt-pill yt-pill-tomorrow';
  return 'yt-pill yt-pill-future';
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}



function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function isDateWithinRange(ymd: string, fromYMD: string, toYMD: string): boolean {
  return ymd >= fromYMD && ymd <= toYMD;
}

/* ===================== Component ===================== */

export default function Timeline() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('Project');
  const [showCompleted, setShowCompleted] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => monthStart(new Date()));

  const dateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ── Load & sync ── */
  useEffect(() => {
    const load = () => {
      const snap = readSelectedProject();
      setBlocks(snap.blocks);
      setProjectTitle(snap.projectTitle);
      setProjectId(snap.project_id);
      setHydrated(true);
    };

    load();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_V2 || e.key === LS_KEY_V1) load();
    };

    window.addEventListener('youtask_projects_updated', load);
    window.addEventListener('youtask_blocks_updated', load);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('youtask_projects_updated', load);
      window.removeEventListener('youtask_blocks_updated', load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /* ── Cuando entras a Show Completed, cae al mes actual ── */
  useEffect(() => {
    if (showCompleted) {
      setVisibleMonth(monthStart(new Date()));
    }
  }, [showCompleted]);

  /* ── Build cards ── */
  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [];
    let currentSectionTitle = '';

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];

      if (b.indent === 0) {
        currentSectionTitle = (b.text || '').trim();
        continue;
      }

      if (b.indent !== 1) continue;
      if (!isValidDateYYYYMMDD(b.deadline)) continue;
      if (b.archived === true) continue;

      const checked = Boolean(b.checked);
      const isHidden = b.isHidden === true;

      if (!showCompleted && (checked || isHidden)) continue;

      const subtasks: SubTask[] = [];
      let j = i + 1;
      while (j < blocks.length && blocks[j].indent > 1) {
        const sb = blocks[j];
        if (sb.archived !== true) {
          subtasks.push({
            id: sb.id,
            text: sb.text || '',
            checked: Boolean(sb.checked),
          });
        }
        j++;
      }

      out.push({
        id: b.id,
        projectTitle: currentSectionTitle || projectTitle || 'General',
        text: b.text || '',
        checked,
        deadline: b.deadline!,
        subtasks,
        isHidden,
        archived: false,
      });
    }

    return out;
  }, [blocks, showCompleted, projectTitle]);

  /* ── Range normal (modo timeline clásico) ── */
  const normalRange = useMemo(() => {
    const deadlines = cards.map(c => c.deadline).filter(isValidDateYYYYMMDD);
    if (!deadlines.length) return null;

    deadlines.sort();
    const t = todayYMD();
    const max = deadlines[deadlines.length - 1];

    return {
      min: t,
      max: max < t ? t : max,
    };
  }, [cards]);

  /* ── Rango del mes seleccionado para Show Completed ── */
  const completedMonthRange = useMemo(() => {
    const from = toYMD(monthStart(visibleMonth));
    const to = toYMD(monthEnd(visibleMonth));
    return { from, to };
  }, [visibleMonth]);

  /* ── Cards by column ── */
  const cardsByDate = useMemo(() => {
    const map: Record<string, Card[]> = {};
    const t0 = startOfLocalDay(new Date()).getTime();

    for (const c of cards) {
      if (showCompleted) {
        if (!isDateWithinRange(c.deadline, completedMonthRange.from, completedMonthRange.to)) {
          continue;
        }

        const key = c.deadline;
        if (!map[key]) map[key] = [];
        map[key].push(c);
        continue;
      }

      const cd = startOfLocalDay(parseYMD(c.deadline)).getTime();
      const key = cd < t0 ? OVERDUE_KEY : c.deadline;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }

    for (const k of Object.keys(map)) {
      if (!showCompleted && k === OVERDUE_KEY) {
        map[k].sort(
          (a, b) => parseYMD(a.deadline).getTime() - parseYMD(b.deadline).getTime(),
        );
      } else {
        map[k].sort((a, b) => {
          if (showCompleted && a.checked !== b.checked) return a.checked ? 1 : -1;
          return (a.projectTitle || '').localeCompare(b.projectTitle || '');
        });
      }
    }

    return map;
  }, [cards, showCompleted, completedMonthRange]);

  const overdueCount = useMemo(
    () => (showCompleted ? 0 : (cardsByDate[OVERDUE_KEY]?.length ?? 0)),
    [cardsByDate, showCompleted],
  );

  /* ── Columns ── */
  const columns = useMemo(() => {
    if (showCompleted) {
      return Object.keys(cardsByDate)
        .filter(k => k !== OVERDUE_KEY)
        .sort((a, b) => a.localeCompare(b));
    }

    if (!normalRange) return [];

    const minD = startOfLocalDay(parseYMD(normalRange.min));
    const maxD = startOfLocalDay(parseYMD(normalRange.max));
    const out: string[] = [OVERDUE_KEY];

    for (
      let d = new Date(minD);
      d.getTime() <= maxD.getTime();
      d.setDate(d.getDate() + 1)
    ) {
      out.push(toYMD(d));
    }

    return out;
  }, [showCompleted, cardsByDate, normalRange]);

  const nowMonth = useMemo(() => monthStart(new Date()), []);

  const canGoNextMonth = useMemo(() => {
    return monthStart(visibleMonth).getTime() < nowMonth.getTime();
  }, [visibleMonth, nowMonth]);



  /* ── Actions ── */
  const toggleDone = (cardId: string) => {
    const next = blocks.map(x => ({ ...x }));
    const t = todayYMD();

    for (const b of next) {
      if (b.id !== cardId || b.indent !== 1) continue;
      const nextChecked = !Boolean(b.checked);
      b.checked = nextChecked;
      if (nextChecked) {
        b.deadline = t;
        b.isHidden = false;
      }
      break;
    }

    writeSelectedProjectBlocks(projectId, next);
    setBlocks(next);
  };

  const openReschedulePicker = (cardId: string) => {
    const el = dateRefs.current[cardId];
    if (!el) return;

    try {
      if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
        (el as HTMLInputElement & { showPicker?: () => void }).showPicker!();
      } else {
        el.click();
      }
    } catch {
      el.click();
    }
  };

  const rescheduleDeadline = (cardId: string, newDeadline: string) => {
    if (!isValidDateYYYYMMDD(newDeadline)) return;

    const next = blocks.map(x => ({ ...x }));
    for (const b of next) {
      if (b.id !== cardId || b.indent !== 1) continue;
      b.deadline = newDeadline;
      if (b.isHidden === true) b.isHidden = false;
      break;
    }

    writeSelectedProjectBlocks(projectId, next);
    setBlocks(next);
  };

  /* ── Render ── */
  if (!hydrated) {
    return (
      <div className="youtask-timeline-root">
        <div className="youtask-timeline-top">
          <div className="youtask-timeline-title">Timeline</div>
        </div>
        <div className="youtask-timeline-loading">Cargando timeline…</div>
      </div>
    );
  }

  return (
    <div className="youtask-timeline-root">
      <div className="youtask-timeline-top">
        <div className="youtask-timeline-title">
          Timeline

          {!showCompleted ? (
            <span className="youtask-timeline-sub">
              {' '}· {projectTitle || 'Project'}
              {!normalRange
                ? ' · (sin deadlines)'
                : ` · Overdue (${overdueCount}) · ${normalRange.min} → ${normalRange.max} · ${Math.max(0, columns.length - 1)} days`}
            </span>
          ) : (
            <span
              className="youtask-timeline-sub"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                marginLeft: 10,
              }}
            >
              <button
                type="button"
                className="youtask-timeline-monthnav"
                onClick={() => setVisibleMonth(prev => addMonths(prev, -1))}
                title="Previous month"
                aria-label="Previous month"
              >
                ‹
              </button>

              <span className="youtask-timeline-monthlabel">
                {monthLabel(visibleMonth)}
              </span>

              <button
                type="button"
                className="youtask-timeline-monthnav"
                onClick={() => {
                  if (canGoNextMonth) {
                    setVisibleMonth(prev => addMonths(prev, 1));
                  }
                }}
                title="Next month"
                aria-label="Next month"
                disabled={!canGoNextMonth}
                style={{
                  opacity: canGoNextMonth ? 1 : 0.35,
                  cursor: canGoNextMonth ? 'pointer' : 'default',
                }}
              >
                ›
              </button>
            </span>
          )}
        </div>

        <div className="youtask-timeline-actions">
          <button
            type="button"
            className={['youtask-timeline-toggle', showCompleted ? 'is-on' : ''].join(' ')}
            onClick={() => setShowCompleted(v => !v)}
            title="Muestra tasks del mes completo, tanto completados como pendientes, ocultando días sin activity. Archived no aparece aquí."
          >
            {showCompleted ? '✓ Show Completed' : 'Show Completed'}
          </button>
        </div>
      </div>

      {columns.length === 0 ? (
        <div className="youtask-timeline-empty">
          {showCompleted
            ? `No tasks in ${monthLabel(visibleMonth)}.`
            : 'No tasks yet.'}
        </div>
      ) : (
        <div className="youtask-timeline-board">
          {columns.map(colKey => {
            const list = cardsByDate[colKey] || [];
            const isOverdueCol = !showCompleted && colKey === OVERDUE_KEY;
            const title = isOverdueCol ? 'Overdue' : fmtColTitle(colKey);
            const diff = isOverdueCol ? -1 : dayDiffFromToday(colKey);

            const hasOpen = list.some(c => !c.checked);
            const showOverduePill = showCompleted ? diff < 0 && hasOpen : diff < 0;
            const pillDiffForClass = showOverduePill ? -1 : Math.max(0, diff);

            const pillText = (() => {
              if (isOverdueCol || showOverduePill) return 'Overdue';
              if (diff === 0) return 'Today';
              if (diff === 1) return 'Tomorrow';
              if (diff > 1) return `+${diff}d`;
              return '';
            })();

            return (
              <div key={colKey} className="yt-col">
                <div className="yt-col-header">
                  <div className="yt-col-title">
                    {title}
                    {isOverdueCol ? (
                      <span className="youtask-timeline-sub" style={{ marginLeft: 8 }}>
                        · {list.length}
                      </span>
                    ) : null}
                  </div>

                  {pillText ? (
                    <div className={pillClass(pillDiffForClass)} title={isOverdueCol ? 'Overdue' : colKey}>
                      {pillText}
                    </div>
                  ) : null}
                </div>

                <div className="yt-col-body">
                  {list.length === 0 ? (
                    <div className="yt-empty">—</div>
                  ) : (
                    list.map(card => {
                      const overdueDays = !showCompleted
                        ? Math.max(0, Math.abs(Math.min(0, dayDiffFromToday(card.deadline))))
                        : 0;

                      return (
                        <div key={card.id} className={['yt-card', card.checked ? 'is-done' : ''].join(' ')}>
                          <div className="yt-card-top">
                            <div className="yt-project">
                              {card.projectTitle || projectTitle || 'General'}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {isOverdueCol ? (
                                <>
                                  <button
                                    type="button"
                                    className="yt-reschedule"
                                    onClick={() => openReschedulePicker(card.id)}
                                    title="Re-schedule"
                                    aria-label="Reschedule"
                                  >
                                    📅
                                  </button>

                                  <input
                                    ref={el => {
                                      dateRefs.current[card.id] = el;
                                    }}
                                    type="date"
                                    className="hidden"
                                    value={isValidDateYYYYMMDD(card.deadline) ? card.deadline : ''}
                                    onChange={e => {
                                      if (e.target.value) rescheduleDeadline(card.id, e.target.value);
                                    }}
                                  />
                                </>
                              ) : null}

                              <button
                                type="button"
                                className={['yt-tick', card.checked ? 'is-on' : ''].join(' ')}
                                onClick={() => toggleDone(card.id)}
                                title={card.checked ? 'Marcar como pendiente' : 'Marcar como completado'}
                                aria-label={card.checked ? 'Completed' : 'Mark completed'}
                              >
                                {card.checked ? '' : '○'}
                              </button>

                              {card.checked ? <div className="yt-donebadge">✓</div> : null}
                            </div>
                          </div>

                          <div className="yt-card-title">{card.text || '(sin texto)'}</div>

                          {isOverdueCol ? (
                            <div className="yt-overdue-meta" title={card.deadline}>
                              <span className="yt-pill yt-pill-future yt-overdue-date-pill">
                                {fmtColTitle(card.deadline)}
                              </span>
                              <span className="yt-pill yt-pill-overdue yt-overdue-days-pill">
                                {overdueDays}d late
                              </span>
                            </div>
                          ) : null}

                          {card.subtasks.length > 0 ? (
                            <div className="yt-subtasks">
                              {card.subtasks.map(st => (
                                <div key={st.id} className={['yt-subtask', st.checked ? 'is-done' : ''].join(' ')}>
                                  <span className="yt-subdot">{st.checked ? '✓' : '•'}</span>
                                  <span className="yt-subtext">{st.text || '(subtask)'}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}