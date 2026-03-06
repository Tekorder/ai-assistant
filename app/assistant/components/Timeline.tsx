'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

type Block = {
  id: string;
  text: string;
  indent: number;
  checked?: boolean;
  deadline?: string;
  isHidden?: boolean;
  archived?: boolean;
};

// ✅ NUEVO: proyectos
const LS_KEY_V2 = 'youtask_projects_v1';
// ✅ VIEJO: solo blocks (fallback)
const LS_KEY_V1 = 'youtask_blocks_v1';

type Project = {
  project_id: string;
  title: string;
  blocks: Block[];
  collapsed?: Record<string, boolean>;
};

function isValidDateYYYYMMDD(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function todayYMD() {
  return toYMD(new Date());
}

function fmtColTitle(ymd: string) {
  const d = parseYMD(ymd);
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.toLocaleDateString('en-US', { day: '2-digit' });
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${wd} ${day} ${mon}`;
}

function dayDiffFromToday(ymd: string) {
  const target = startOfLocalDay(parseYMD(ymd));
  const today = startOfLocalDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
function pillClass(diff: number) {
  if (diff < 0) return 'yt-pill yt-pill-overdue';
  if (diff === 0) return 'yt-pill yt-pill-today';
  if (diff === 1) return 'yt-pill yt-pill-tomorrow';
  return 'yt-pill yt-pill-future';
}

const OVERDUE_KEY = '__OVERDUE__';

type SubTask = { id: string; text: string; checked: boolean };
type Card = {
  id: string;
  projectTitle: string;
  text: string;
  checked: boolean;
  deadline: string; // para OVERDUE guardamos deadline original
  subtasks: SubTask[];
  isHidden?: boolean;
  archived?: boolean;
};

function normalizeLoadedBlocks(raw: any): Block[] {
  const uid = () => Math.random().toString(36).slice(2, 10);
  if (!Array.isArray(raw)) return [{ id: uid(), text: '', indent: 0 }];

  const out: Block[] = raw.map((x: any) => {
    const id = typeof x?.id === 'string' ? x.id : uid();
    const text = typeof x?.text === 'string' ? x.text : '';
    const indent = Number.isFinite(x?.indent) ? Number(x.indent) : 0;

    const b: Block = { id, text, indent: Math.max(0, indent) };

    if (b.indent > 0) {
      b.checked = Boolean(x?.checked);
      if (isValidDateYYYYMMDD(x?.deadline)) b.deadline = x.deadline;
    } else {
      b.checked = undefined;
      b.deadline = undefined;
    }

    if (typeof x?.isHidden === 'boolean') b.isHidden = x.isHidden;
    if (typeof x?.archived === 'boolean') b.archived = x.archived;

    return b;
  });

  return out.length ? out : [{ id: uid(), text: '', indent: 0 }];
}

// ─────────────────────────────────────────────────────────────
// ✅ READ: lee proyecto seleccionado desde V2 (fallback a V1)
function readSelectedProject(): { blocks: Block[]; projectTitle: string; project_id: string | null } {
  // 1) Intentar V2
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw);
      const projects: Project[] = Array.isArray(parsed?.projects) ? parsed.projects : [];
      if (projects.length) {
        const selectedId: string =
          typeof parsed?.selectedProjectId === 'string' ? parsed.selectedProjectId : projects[0].project_id;

        const p = projects.find(x => x.project_id === selectedId) || projects[0];

        return {
          blocks: normalizeLoadedBlocks(p?.blocks ?? []),
          projectTitle: (p?.title || 'Project').trim() || 'Project',
          project_id: p?.project_id || null,
        };
      }
    }
  } catch {
    // ignore
  }

  // 2) Fallback V1
  try {
    const raw = localStorage.getItem(LS_KEY_V1);
    if (!raw) return { blocks: [], projectTitle: 'General', project_id: null };
    const parsed = JSON.parse(raw);
    const blocks = normalizeLoadedBlocks(parsed?.blocks ?? parsed);
    return { blocks, projectTitle: 'General', project_id: null };
  } catch {
    return { blocks: [], projectTitle: 'General', project_id: null };
  }
}

// ─────────────────────────────────────────────────────────────
// ✅ WRITE: si hay V2 y project_id, actualiza SOLO ese proyecto
function writeSelectedProjectBlocks(project_id: string | null, nextBlocks: Block[]) {
  // si no hay project_id => fallback a V1
  if (!project_id) {
    try {
      const raw = localStorage.getItem(LS_KEY_V1);
      let payload: any = { blocks: nextBlocks, collapsed: {} };
      if (raw) {
        const parsed = JSON.parse(raw);
        payload = {
          blocks: nextBlocks,
          collapsed: parsed?.collapsed && typeof parsed.collapsed === 'object' ? parsed.collapsed : {},
        };
      }
      localStorage.setItem(LS_KEY_V1, JSON.stringify(payload));
      window.dispatchEvent(new Event('youtask_blocks_updated'));
    } catch {}
    return;
  }

  // V2 update
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const projects: Project[] = Array.isArray(parsed?.projects) ? parsed.projects : [];
    if (!projects.length) return;

    const idx = projects.findIndex(p => p.project_id === project_id);
    if (idx < 0) return;

    const nextProjects = projects.map(p => ({ ...p }));
    nextProjects[idx] = {
      ...nextProjects[idx],
      blocks: nextBlocks,
    };

    const payload = {
      ...parsed,
      projects: nextProjects,
    };

    localStorage.setItem(LS_KEY_V2, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_projects_updated'));
    window.dispatchEvent(new Event('youtask_blocks_updated')); // compat
  } catch {}
}

export default function Timeline({ onOpenArchive }: { onOpenArchive?: () => void }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // ✅ proyecto seleccionado
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('Project');

  // Show Completed: muestra completados (incluye isHidden), pero SIEMPRE excluye archived
  const [showCompleted, setShowCompleted] = useState(false);

  // ✅ date pickers (Reschedule)
  const dateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const load = () => {
      const snap = readSelectedProject();
      setBlocks(snap.blocks);
      setProjectTitle(snap.projectTitle);
      setProjectId(snap.project_id);
      setHydrated(true);
    };

    load();

    const onProjects = () => load();
    const onBlocks = () => load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_V2 || e.key === LS_KEY_V1) load();
    };

    window.addEventListener('youtask_projects_updated', onProjects);
    window.addEventListener('youtask_blocks_updated', onBlocks);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('youtask_projects_updated', onProjects);
      window.removeEventListener('youtask_blocks_updated', onBlocks);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const cards: Card[] = useMemo(() => {
    const out: Card[] = [];
    let currentSectionTitle = '';

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];

      if (b.indent === 0) {
        currentSectionTitle = (b.text || '').trim();
        continue;
      }

      // SOLO tasks indent=1 con deadline
      if (b.indent === 1) {
        if (!isValidDateYYYYMMDD(b.deadline)) continue;

        const checked = Boolean(b.checked);
        const isHidden = b.isHidden === true;
        const isArchived = b.archived === true;

        // Timeline JAMÁS muestra archived
        if (isArchived) continue;

        if (!showCompleted) {
          if (checked) continue;
          if (isHidden) continue;
        }

        const subtasks: SubTask[] = [];
        let j = i + 1;
        while (j < blocks.length && blocks[j].indent > 1) {
          const sb = blocks[j];
          if (sb.archived === true) {
            j++;
            continue;
          }
          subtasks.push({ id: sb.id, text: sb.text || '', checked: Boolean(sb.checked) });
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
          archived: isArchived,
        });
      }
    }

    return out;
  }, [blocks, showCompleted, projectTitle]);

  // === RANGE ===
  const range = useMemo(() => {
    const deadlines = cards.map(c => c.deadline).filter(isValidDateYYYYMMDD);
    if (!deadlines.length) return null;

    deadlines.sort();

    if (showCompleted) {
      return { min: deadlines[0], max: deadlines[deadlines.length - 1] };
    }

    const t = todayYMD();
    const max = deadlines[deadlines.length - 1];
    const maxVisible = max < t ? t : max;
    return { min: t, max: maxVisible };
  }, [cards, showCompleted]);

  // === CARDS BY COLUMN KEY ===
  const cardsByDate = useMemo(() => {
    const map: Record<string, Card[]> = {};
    const t0 = startOfLocalDay(new Date()).getTime();

    for (const c of cards) {
      const cd = startOfLocalDay(parseYMD(c.deadline)).getTime();

      if (showCompleted) {
        if (!map[c.deadline]) map[c.deadline] = [];
        map[c.deadline].push(c);
        continue;
      }

      const key = cd < t0 ? OVERDUE_KEY : c.deadline;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }

    for (const k of Object.keys(map)) {
      if (!showCompleted && k === OVERDUE_KEY) {
        map[k].sort((a, b) => parseYMD(a.deadline).getTime() - parseYMD(b.deadline).getTime());
      } else {
        map[k].sort((a, b) => {
          if (showCompleted && a.checked !== b.checked) return a.checked ? 1 : -1;
          return (a.projectTitle || '').localeCompare(b.projectTitle || '');
        });
      }
    }

    return map;
  }, [cards, showCompleted]);

  const overdueCount = useMemo(() => {
    if (showCompleted) return 0;
    return cardsByDate[OVERDUE_KEY]?.length ?? 0;
  }, [cardsByDate, showCompleted]);

  // === COLUMNS ===
  const columns = useMemo(() => {
    if (!range) return [];

    if (showCompleted) {
      const minD = startOfLocalDay(parseYMD(range.min));
      const maxD = startOfLocalDay(parseYMD(range.max));
      const out: string[] = [];
      for (let d = new Date(minD); d.getTime() <= maxD.getTime(); d.setDate(d.getDate() + 1)) {
        out.push(toYMD(d));
      }
      return out;
    }

    const minD = startOfLocalDay(parseYMD(range.min)); // hoy
    const maxD = startOfLocalDay(parseYMD(range.max));
    const out: string[] = [OVERDUE_KEY];
    for (let d = new Date(minD); d.getTime() <= maxD.getTime(); d.setDate(d.getDate() + 1)) {
      out.push(toYMD(d));
    }
    return out;
  }, [range, showCompleted]);

  // ✅ Toggle done:
  // - al marcar completado: deadline = hoy (bitácora)
  const toggleDoneFromTimeline = (cardId: string) => {
    const next = blocks.map(x => ({ ...x }));
    const t = todayYMD();
    let changed = false;

    for (let i = 0; i < next.length; i++) {
      const b = next[i];
      if (b.id !== cardId) continue;
      if (b.indent !== 1) return;

      const nextChecked = !Boolean(b.checked);
      b.checked = nextChecked;

      if (nextChecked) {
        b.deadline = t;
        b.isHidden = false;
      }

      changed = true;
      break;
    }

    if (changed) {
      writeSelectedProjectBlocks(projectId, next);
      setBlocks(next);
    }
  };

  // ✅ Reschedule (abre date picker y actualiza deadline)
  const openReschedulePicker = (cardId: string) => {
    const el = dateRefs.current[cardId];
    if (!el) return;
    try {
      // @ts-ignore
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.click();
    } catch {
      el.click();
    }
  };

  const rescheduleDeadline = (cardId: string, newDeadline: string) => {
    if (!isValidDateYYYYMMDD(newDeadline)) return;

    const next = blocks.map(x => ({ ...x }));
    let changed = false;

    for (let i = 0; i < next.length; i++) {
      const b = next[i];
      if (b.id !== cardId) continue;
      if (b.indent !== 1) return;

      b.deadline = newDeadline;

      // si estaba oculto, al reschedule lo traemos de vuelta
      if (b.isHidden === true) b.isHidden = false;

      changed = true;
      break;
    }

    if (changed) {
      writeSelectedProjectBlocks(projectId, next);
      setBlocks(next);
    }
  };

  // (opcional) Archive Completed (si lo activás en UI)
  const archiveCompleted = () => {
    const next = blocks.map(x => ({ ...x }));
    let changed = false;

    for (let i = 0; i < next.length; i++) {
      const b = next[i];

      if (b.indent === 1 && b.checked === true && b.archived !== true) {
        b.archived = true;
        changed = true;

        let j = i + 1;
        while (j < next.length && next[j].indent > 1) {
          if (next[j].archived !== true) next[j].archived = true;
          j++;
        }
      }
    }

    if (changed) {
      writeSelectedProjectBlocks(projectId, next);
      setBlocks(next);
    }
  };

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
          <span className="youtask-timeline-sub">
            {' '}
            · {projectTitle || 'Project'}
            {!range
              ? ' · (sin deadlines)'
              : showCompleted
                ? ` · ${range.min} → ${range.max} · ${columns.length} días`
                : ` · Overdue (${overdueCount}) · ${range.min} → ${range.max} · ${Math.max(
                    0,
                    columns.length - 1
                  )} días`}
          </span>
        </div>

        <div className="youtask-timeline-actions">
          <button
            type="button"
            className={['youtask-timeline-toggle', showCompleted ? 'is-on' : ''].join(' ')}
            onClick={() => setShowCompleted(v => !v)}
            title="Muestra tasks completados (incluye ocultos por Dismiss). Archived no aparece aquí."
          >
            {showCompleted ? '✓ Show Completed' : 'Show Completed'}
          </button>

          {/* opcional */}
          {/* <button type="button" className="youtask-timeline-toggle" onClick={archiveCompleted}>Archive Completed</button> */}
        </div>
      </div>

      {!range ? (
        <div className="youtask-timeline-empty">
          No tasks yet.
        </div>
      ) : (
        <div className="youtask-timeline-board">
          {columns.map(colKey => {
            const list = cardsByDate[colKey] || [];

            const isOverdueCol = !showCompleted && colKey === OVERDUE_KEY;
            const title = isOverdueCol ? 'Overdue' : fmtColTitle(colKey);

            const diff = isOverdueCol ? -1 : dayDiffFromToday(colKey);

            // ✅ FIX: en SHOW COMPLETED, "Overdue" solo si ese día pasado tiene pendientes
            const hasOpen = list.some(c => !c.checked);
            const showOverduePill = showCompleted ? diff < 0 && hasOpen : diff < 0;

            const pillDiffForClass = showOverduePill ? -1 : Math.max(0, diff);

            const pillText = (() => {
              if (isOverdueCol) return 'Overdue';
              if (showOverduePill) return 'Overdue';
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
                            <div className="yt-project">{card.projectTitle || projectTitle || 'General'}</div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isOverdueCol ? (
                                        <>
                                          <button
                                            type="button"
                                            className="yt-reschedule"
                                            onClick={() => openReschedulePicker(card.id)}
                                            title="Re-schedule (cambiar deadline)"
                                            aria-label="Reschedule"
                                          >
                                            📅
                                          </button>

                                          <input
                                            ref={el => void  (dateRefs.current[card.id] = el)}
                                            type="date"
                                            className="hidden"
                                            value={isValidDateYYYYMMDD(card.deadline) ? card.deadline : ''}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              if (v) rescheduleDeadline(card.id, v);
                                            }}
                                          />
                                        </>
                                      ) : null}

                              {/* ✅ Done toggle */}
                              <button
                                type="button"
                                className={['yt-tick', card.checked ? 'is-on' : ''].join(' ')}
                                onClick={() => toggleDoneFromTimeline(card.id)}
                                title={
                                  card.checked
                                    ? 'Marcar como pendiente'
                                    : 'Marcar como completado (y mover deadline a hoy)'
                                }
                                aria-label={card.checked ? 'Completed' : 'Mark completed'}
                              >
                                {card.checked ? '✓' : '○'}
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