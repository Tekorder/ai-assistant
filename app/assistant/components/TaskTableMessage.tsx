'use client';

import React from 'react';
import type { TaskTableRow } from '../_types/Message';
import { labelForYMD, pillClass } from '@/lib/datacenter';

interface TaskTableMessageProps {
  rows: TaskTableRow[];
  onToggle: (rowId: string, checked: boolean) => void;
}

export default function TaskTableMessage({ rows, onToggle }: TaskTableMessageProps) {
  if (!rows.length) {
    return (
      <p className="mt-2 text-xs" style={{ color: 'var(--assistant-text-soft)' }}>
        Nothing here — you&apos;re all caught up.
      </p>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl" style={{ border: '1px solid var(--assistant-border-soft)' }}>
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr style={{ background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-muted)' }}>
            <th className="w-8 px-2 py-1.5" />
            <th className="px-2 py-1.5 font-medium">Task</th>
            <th className="px-2 py-1.5 font-medium">List</th>
            <th className="px-2 py-1.5 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
              <td className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={e => onToggle(row.id, e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                  style={{ accentColor: 'var(--assistant-tone-1)' }}
                  aria-label={`Mark "${row.text}" as done`}
                />
              </td>
              <td
                className="px-2 py-1.5"
                style={
                  row.checked
                    ? { textDecoration: 'line-through', color: 'var(--assistant-text-faint)' }
                    : { color: 'var(--assistant-text)' }
                }
              >
                {row.text}
              </td>
              <td className="px-2 py-1.5" style={{ color: 'var(--assistant-text-soft)' }}>
                {row.listName}
              </td>
              <td className="px-2 py-1.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${pillClass(row.deadline, row.checked)}`}>
                  {row.deadline ? labelForYMD(row.deadline) : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
