'use client';
import React, { useEffect, useMemo, useState } from 'react';

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
  collapsed?: unknown;
};

function isValidDateYYYYMMDD(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalizeLoadedBlocks(raw: unknown): Block[] {
  const uid = () => Math.random().toString(36).slice(2, 10);
  if (!Array.isArray(raw)) return [{ id: uid(), text: '', indent: 0 }];

const out: Block[] = raw.map((x: unknown) => {
  const item = x as Record<string, unknown>;
  
  const id = typeof item?.id === 'string' ? item.id : uid();
  const text = typeof item?.text === 'string' ? item.text : '';
  const indent = Number.isFinite(item?.indent) ? Number(item.indent) : 0;

  const b: Block = { id, text, indent: Math.max(0, indent) };

  if (b.indent > 0) {
    b.checked = Boolean(item?.checked);
    if (isValidDateYYYYMMDD(item?.deadline)) b.deadline = item.deadline as string;
  } else {
    b.checked = undefined;
    b.deadline = undefined;
  }

  if (typeof item?.isHidden === 'boolean') b.isHidden = item.isHidden as boolean;
  if (typeof item?.archived === 'boolean') b.archived = item.archived as boolean;

  return b;
});

  return out.length ? out : [{ id: uid(), text: '', indent: 0 }];
}

// ─────────────────────────────────────────────────────────────
// ✅ Lee proyecto seleccionado desde V2 (fallback a V1)
function readSelectedProject(): { blocks: Block[]; collapsed: unknown; projectTitle: string; project_id: string | null } {
  // V2
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
          collapsed: p?.collapsed && typeof p.collapsed === 'object' ? p.collapsed : {},
          projectTitle: (p?.title || 'Project').trim() || 'Project',
          project_id: p?.project_id || null,
        };
      }
    }
  } catch {
    // ignore
  }

  // V1 fallback
  try {
    const raw = localStorage.getItem(LS_KEY_V1);
    if (!raw) return { blocks: [], collapsed: {}, projectTitle: 'General', project_id: null };
    const parsed = JSON.parse(raw);
    return {
      blocks: normalizeLoadedBlocks(parsed?.blocks ?? parsed),
      collapsed: parsed?.collapsed && typeof parsed.collapsed === 'object' ? parsed.collapsed : {},
      projectTitle: 'General',
      project_id: null,
    };
  } catch {
    return { blocks: [], collapsed: {}, projectTitle: 'General', project_id: null };
  }
}

// ─────────────────────────────────────────────────────────────
// ✅ Guarda SOLO ese proyecto en V2 (fallback a V1)
function writeSelectedProject(project_id: string | null, blocks: Block[], collapsed: unknown) {
  // fallback V1
  if (!project_id) {
    try {
      localStorage.setItem(LS_KEY_V1, JSON.stringify({ blocks, collapsed: collapsed || {} }));
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
      blocks,
      collapsed: collapsed && typeof collapsed === 'object' ? collapsed : {},
    };

    const payload = { ...parsed, projects: nextProjects };

    localStorage.setItem(LS_KEY_V2, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_projects_updated'));
    // compat opcional
    window.dispatchEvent(new Event('youtask_blocks_updated'));
  } catch {
    // ignore
  }
}

type Row = {
  taskId: string;
  projectTitle: string; // (titulo indent=0 dentro del proyecto)
  text: string;
  deadline?: string;
  subtasks: { id: string; text: string; checked: boolean }[];
};

export default function Archive() { //
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [collapsed, setCollapsed] = useState<unknown>({});
  const [hydrated, setHydrated] = useState(false);

  // ✅ proyecto seleccionado actual (para guardar bien)
  const [projectId, setProjectId] = useState<string | null>(null);
  const [outerProjectTitle, setOuterProjectTitle] = useState<string>('Project');

  useEffect(() => {
    const load = () => {
      const data = readSelectedProject();
      setBlocks(data.blocks);
      setCollapsed(data.collapsed);
      setProjectId(data.project_id);
      setOuterProjectTitle(data.projectTitle);
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

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    let currentTitle = '';

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];

      // dentro de un proyecto, indent=0 son "títulos" (secciones)
      if (b.indent === 0) {
        currentTitle = (b.text || '').trim();
        continue;
      }

      // task archivado (indent=1)
      if (b.indent === 1 && b.archived === true) {
        const subtasks: Row['subtasks'] = [];
        let j = i + 1;

        while (j < blocks.length && blocks[j].indent > 1) {
          const sb = blocks[j];
          if (sb.archived === true) {
            subtasks.push({ id: sb.id, text: sb.text || '', checked: Boolean(sb.checked) });
          }
          j++;
        }

        out.push({
          taskId: b.id,
          projectTitle: currentTitle || outerProjectTitle || 'General',
          text: b.text || '',
          deadline: isValidDateYYYYMMDD(b.deadline) ? b.deadline : undefined,
          subtasks,
        });
      }
    }

    // orden: deadline desc (más nuevo arriba), luego proyecto
    out.sort((a, b) => {
      const da = a.deadline || '0000-00-00';
      const db = b.deadline || '0000-00-00';
      if (da !== db) return db.localeCompare(da);
      return (a.projectTitle || '').localeCompare(b.projectTitle || '');
    });

    return out;
  }, [blocks, outerProjectTitle]);

  const unarchiveTask = (taskId: string) => {
    const next = blocks.map(x => ({ ...x }));
    let changed = false;

    for (let i = 0; i < next.length; i++) {
      const b = next[i];

      if (b.id === taskId && b.indent === 1) {
        if (b.archived === true) {
          b.archived = false;
          changed = true;
        }

        // desarchivar subtasks debajo
        let j = i + 1;
        while (j < next.length && next[j].indent > 1) {
          if (next[j].archived === true) {
            next[j].archived = false;
            changed = true;
          }
          j++;
        }
        break;
      }
    }

    if (changed) {
      writeSelectedProject(projectId, next, collapsed);
      setBlocks(next);
    }
  };

  const unarchiveAll = () => {
    const next = blocks.map(x => ({ ...x }));
    let changed = false;

    for (let i = 0; i < next.length; i++) {
      if (next[i].archived === true) {
        next[i].archived = false;
        changed = true;
      }
    }

    if (changed) {
      writeSelectedProject(projectId, next, collapsed);
      setBlocks(next);
    }
  };

  if (!hydrated) {
    return (
      <div className="youtask-archive-root">
        <div className="youtask-archive-top">
          <div className="youtask-archive-title">Archive</div>
        </div>
        <div className="youtask-archive-loading">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="youtask-archive-root">
      <div className="youtask-archive-top">
        <div className="youtask-archive-title">
          Archive
          <span className="youtask-archive-sub">
            {' '}
            · {outerProjectTitle || 'Project'} · {rows.length} items
          </span>
        </div>

        <div className="youtask-archive-actions">
          <button type="button" className="youtask-archive-btn" onClick={unarchiveAll} title="Saca todo del archivo">
            Unarchive All
          </button>

         
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="youtask-archive-empty">No tasks archived</div>
      ) : (
        <div className="youtask-archive-tablewrap">
          <table className="youtask-archive-table">
            <thead>
              <tr>
                <th>Deadline</th>
                <th>Project</th>
                <th>Task</th>
                <th>Subtasks</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(r => (
                <tr key={r.taskId}>
                  <td className="youtask-archive-muted">{r.deadline || '—'}</td>
                  <td>{r.projectTitle}</td>
                  <td className="youtask-archive-taskcell">
                    <div className="youtask-archive-task">{r.text}</div>
                  </td>
                  <td className="youtask-archive-muted">
                    {r.subtasks.length ? `${r.subtasks.filter(x => x.checked).length}/${r.subtasks.length}` : '—'}
                  </td>
                  <td className="youtask-archive-right">
                    <button
                      type="button"
                      className="youtask-archive-btnsmall"
                      onClick={() => unarchiveTask(r.taskId)}
                      title="Desarchivar"
                    >
                      Unarchive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}