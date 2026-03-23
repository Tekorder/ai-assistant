'use client';
import React, { useEffect, useMemo, useState } from 'react';

import {
  // Types
  type Block,
  // Constants
  LS_KEY_V2,
  LS_KEY_V1,
  // Utilities
  isValidDateYYYYMMDD,
  // Persistence
  readSelectedProject,
  writeSelectedProject,
  // Archive mutations
  unarchiveTask as unarchiveTaskArr
} from '@/lib/datacenter';

/* ===================== Local UI types ===================== */

type Row = {
  taskId: string;
  projectTitle: string;
  text: string;
  deadline?: string;
  // subtasks: { id: string; text: string; checked: boolean }[]; // TODO: activar cuando se usen subtasks
};

/* ===================== Component ===================== */

export default function Archive() {
  const [blocks, setBlocks]         = useState<Block[]>([]);
  const [collapsed] = useState<unknown>({});
  const [hydrated, setHydrated]     = useState(false);
  const [projectId, setProjectId]   = useState<string | null>(null);
  const [outerProjectTitle, setOuterProjectTitle] = useState<string>('Project');

  /* ── Load & sync ── */
  useEffect(() => {
    const load = () => {
      const data = readSelectedProject();
      setBlocks(data.blocks);
      setProjectId(data.project_id);
      setOuterProjectTitle(data.projectTitle);
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

  /* ── Build rows ── */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let currentTitle = '';

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];

      if (b.indent === 0) {
        currentTitle = (b.text || '').trim();
        continue;
      }

      if (b.indent !== 1 || b.archived !== true) continue;

      // TODO: cuando se activen subtasks, descomentar este bloque
      // const subtasks: Row['subtasks'] = [];
      // let j = i + 1;
      // while (j < blocks.length && blocks[j].indent > 1) {
      //   const sb = blocks[j];
      //   if (sb.archived === true) {
      //     subtasks.push({ id: sb.id, text: sb.text || '', checked: Boolean(sb.checked) });
      //   }
      //   j++;
      // }

      out.push({
        taskId:       b.id,
        projectTitle: currentTitle || outerProjectTitle || 'General',
        text:         b.text || '',
        deadline:     isValidDateYYYYMMDD(b.deadline) ? b.deadline : undefined,
        // subtasks,
      });
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

  /* ── Actions ── */
  const handleUnarchiveTask = (taskId: string) => {
    const next = unarchiveTaskArr(blocks, taskId);
    writeSelectedProject(projectId, next, collapsed);
    setBlocks(next);
  };


  /* ── Render ── */
  if (!hydrated) {
    return (
      <div className="youtask-archive-root">
        <div className="youtask-archive-top">
          <div className="youtask-archive-title">Trash Bin</div>
        </div>
        <div className="youtask-archive-loading">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="youtask-archive-root">
      <div className="youtask-archive-top">
        <div className="youtask-archive-title">
          Trash Bin
          <span className="youtask-archive-sub">
            {' '}· {outerProjectTitle || 'Project'} · {rows.length} items
          </span>
        </div>

      </div>

      {rows.length === 0 ? (
        <div className="youtask-archive-empty">No tasks in trash bin</div>
      ) : (
        <div className="youtask-archive-tablewrap">
          <table className="youtask-archive-table">
            <thead>
              <tr>
                <th>Deadline</th>
                <th>Project</th>
                <th>Task</th>
                {/* <th>Subtasks</th> */}{/* TODO: activar cuando se usen subtasks */}
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
                  {/* <td className="youtask-archive-muted">
                    {r.subtasks.length ? `${r.subtasks.filter(x => x.checked).length}/${r.subtasks.length}` : '—'}
                  </td> */}
                  <td className="youtask-archive-right">
                    <button type="button" className="youtask-archive-btnsmall"
                      onClick={() => handleUnarchiveTask(r.taskId)}
                      title="Desarchivar">
                      Restore
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