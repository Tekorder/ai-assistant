'use client';
import React, { useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import { type Project, isUncTitleBlock } from '@/lib/datacenter';

export type MoveTargetGroup = {
  projectId: string;
  title: string;
  lists: { id: string; label: string }[];
};

/**
 * Delete confirmation for a list or a group. When it still has unchecked tasks it
 * asks first: move them to another list (any group), or delete them along with it.
 */
export function DeleteWithOpenTasksDialog({
  kind,
  name,
  openCount,
  targets,
  defaultProjectId,
  zIndex = 999,
  onCancel,
  onDelete,
  onMoveAndDelete,
}: {
  kind: 'list' | 'group';
  name?: string;
  openCount: number;
  /** Lists the tasks can go to (never the one(s) being deleted) */
  targets: MoveTargetGroup[];
  /** Group whose first list is preselected */
  defaultProjectId?: string;
  zIndex?: number;
  onCancel: () => void;
  onDelete: () => void;
  onMoveAndDelete: (projectId: string, listId: string) => void;
}) {
  const [step, setStep] = useState<'choose' | 'move'>('choose');
  const firstTarget =
    targets.find(g => g.projectId === defaultProjectId && g.lists.length)
    ?? targets.find(g => g.lists.length);
  const [target, setTarget] = useState(
    firstTarget ? `${firstTarget.projectId}::${firstTarget.lists[0].id}` : '',
  );
  const canMove = Boolean(firstTarget);
  const noun = kind === 'list' ? 'list' : 'group';
  const tasksWord = openCount === 1 ? 'task' : 'tasks';

  const confirmMove = () => {
    const [projectId, listId] = target.split('::');
    if (projectId && listId) onMoveAndDelete(projectId, listId);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex }}>
      <button type="button" className={`absolute inset-0 ${classes.modalBackdrop}`} onClick={onCancel} aria-label="Close" />
      <div role="dialog" aria-label={`Delete ${noun}`} className={`relative w-[92vw] max-w-md ${classes.modalCard}`}>
        <div className={classes.modalHeader}>
          <div className={classes.modalTitle}>Delete {noun}?</div>
          {openCount === 0 ? (
            <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--assistant-text-soft)' }}>
              {kind === 'list'
                ? 'This list has no unchecked tasks. Deleting it removes it and its completed tasks permanently.'
                : 'This group has no unchecked tasks. Deleting it removes all its lists and completed tasks permanently.'}
            </p>
          ) : step === 'choose' ? (
            <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--assistant-text-soft)' }}>
              Your {noun} has {openCount} unchecked {tasksWord}. Do you want to move them to another list or delete them?
            </p>
          ) : (
            <div className="mt-2">
              <label className="block text-[13px] mb-1.5" style={{ color: 'var(--assistant-text-soft)' }} htmlFor="move-open-tasks-target">
                Select a target list
              </label>
              <select
                id="move-open-tasks-target"
                autoFocus
                value={target}
                onChange={e => setTarget(e.target.value)}
                className={`w-full rounded-lg px-2 py-2 text-[13px] ${classes.quickSearchInput}`}
              >
                {targets.filter(g => g.lists.length).map(g => (
                  <optgroup key={g.projectId} label={g.title}>
                    {g.lists.map(l => (
                      <option key={l.id} value={`${g.projectId}::${l.id}`}>{l.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[12px] mt-2" style={{ color: 'var(--assistant-text-faint)' }}>
                {openCount} unchecked {tasksWord} will be moved, then the {noun} and its completed tasks are deleted.
              </p>
            </div>
          )}
          {name ? (
            <div className="text-[12px] mt-2 break-words" title={name} style={{ color: 'var(--assistant-text-faint)' }}>
              {kind === 'list' ? 'List' : 'Group'}: {name}
            </div>
          ) : null}
        </div>
        <div className={`${classes.modalFooter} flex-wrap justify-end`}>
          {openCount > 0 && step === 'move' ? (
            <>
              <button type="button" onClick={() => setStep('choose')} className={`text-[13px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}>
                Back
              </button>
              <button type="button" onClick={confirmMove} disabled={!target} className={`text-[13px] font-semibold px-3 py-2 rounded-md ${classes.quickModalPrimary}`}>
                Move &amp; delete {noun}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onCancel} className={`text-[13px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                className={`text-[13px] font-medium px-3 py-2 rounded-md ${classes.panelBtnDanger}`}
              >
                {openCount > 0 ? 'Delete everything' : 'Yes, delete'}
              </button>
              {openCount > 0 && canMove ? (
                <button type="button" onClick={() => setStep('move')} className={`text-[13px] font-semibold px-3 py-2 rounded-md ${classes.quickModalPrimary}`}>
                  Move to another list
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Every list in every group, minus the excluded ones, for the target picker. */
export function buildMoveTargets(
  projects: Project[],
  exclude: { projectId?: string; listIds?: string[] },
): MoveTargetGroup[] {
  const isUnc = isUncTitleBlock;
  const skip = new Set(exclude.listIds ?? []);
  return projects
    .filter(p => p.project_id !== exclude.projectId)
    .map(p => ({
      projectId: p.project_id,
      title: p.title,
      lists: (p.blocks ?? [])
        .filter(b => b.indent === 0 && b.archived !== true && !skip.has(b.id))
        // Uncategorized first, then the group's own list order
        .sort((a, b) => Number(isUnc(b)) - Number(isUnc(a)) || a.order - b.order)
        .map(b => ({ id: b.id, label: isUnc(b) ? 'Uncategorized' : ((b.text || '').trim() || 'Untitled list') })),
    }));
}
