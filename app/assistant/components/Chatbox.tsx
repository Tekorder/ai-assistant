'use client';

// External libraries
import React from 'react';

// Internal hooks
import { useTaskMessaging } from '../_hook/useTaskMessaging';

// Components
import RemindersSection from './RemindersSection';
import ChatSection from './ChatSection';

// Data layer (source of truth for lists/tasks — see lib/datacenter.ts)
import {
  readSelectedProject,
  writeSelectedProjectBlocks,
  addTaskUnderList,
  createList,
  updateBlock,
  removeBlock,
  todayYMD,
  addDaysYMD,
  isValidDateYYYYMMDD,
  isUncTitleBlock,
  type Block,
} from '@/lib/datacenter';
import type { TaskTableRow } from '../_types/Message';

interface ChatBoxProps {
  showReminders: boolean;
  onCloseReminders: () => void;
}

interface WaldyBlock {
  text?: string;
  deadline?: string;
}

interface WaldyTaskResponse {
  replyMessage?: string;
  operation?: 'add' | 'check' | 'uncheck' | 'delete' | 'list' | 'none' | string;
  list?: string | null;
  task?: string | null;
  when?: 'today' | 'tomorrow' | 'all' | null;
  block?: WaldyBlock | null;
  error?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

function findListBlock(blocks: Block[], listName: string): Block | undefined {
  return blocks.find(b => b.indent === 0 && !isUncTitleBlock(b) && norm(b.text) === norm(listName));
}

/** Adds the task Waldy extracted to the matching list, creating it if it doesn't exist yet. */
function applyAddTask(listName: string, block: WaldyBlock): void {
  const { blocks, project_id } = readSelectedProject();
  const text = (block.text || '').trim();
  const deadline = isValidDateYYYYMMDD(block.deadline) ? block.deadline : todayYMD();

  const existingList = findListBlock(blocks, listName);

  if (existingList) {
    const result = addTaskUnderList(blocks, existingList.id, { text, deadline });
    writeSelectedProjectBlocks(project_id, result.blocks);
    return;
  }

  const created = createList(blocks, listName, { focusDay: deadline });
  const finalBlocks = updateBlock(created.blocks, created.newTaskId, { text, deadline });
  writeSelectedProjectBlocks(project_id, finalBlocks);
}

/** Finds the task block Waldy referred to, preferring an exact text match, scoped to a list when known. */
function findTaskBlock(blocks: Block[], listName: string | null | undefined, taskText: string): Block | undefined {
  const target = norm(taskText);
  let candidates = blocks.filter(b => b.indent > 0 && b.archived !== true);

  if (listName) {
    const list = findListBlock(blocks, listName);
    if (list) candidates = candidates.filter(b => b.parentId === list.id);
  }

  return (
    candidates.find(b => norm(b.text) === target) ??
    candidates.find(b => norm(b.text).includes(target) || target.includes(norm(b.text)))
  );
}

/** Marks a matching task as done/not-done. Returns false if no task could be resolved. */
function applyCheckTask(listName: string | null | undefined, taskText: string, checked: boolean): boolean {
  const { blocks, project_id } = readSelectedProject();
  const match = findTaskBlock(blocks, listName, taskText);
  if (!match) return false;

  const nextBlocks = updateBlock(blocks, match.id, { checked });
  writeSelectedProjectBlocks(project_id, nextBlocks);
  return true;
}

/**
 * Deletes a single matching task. findTaskBlock only ever matches indent > 0
 * blocks, so this can never resolve to (and delete) an entire list.
 * Returns false if no task could be resolved.
 */
function applyDeleteTask(listName: string | null | undefined, taskText: string): boolean {
  const { blocks, project_id } = readSelectedProject();
  const match = findTaskBlock(blocks, listName, taskText);
  if (!match) return false;

  const nextBlocks = removeBlock(blocks, match.id);
  writeSelectedProjectBlocks(project_id, nextBlocks);
  return true;
}

/** Builds the checkable-table rows for a "list my tasks" request, filtered by list/day. */
function buildTaskTableRows(
  blocks: Block[],
  listName: string | null | undefined,
  when: string | null | undefined,
): TaskTableRow[] {
  let candidates = blocks.filter(b => b.indent > 0 && b.archived !== true);

  if (listName) {
    const list = findListBlock(blocks, listName);
    if (list) candidates = candidates.filter(b => b.parentId === list.id);
  }

  if (when === 'today' || when === 'tomorrow') {
    const target = when === 'today' ? todayYMD() : addDaysYMD(todayYMD(), 1);
    candidates = candidates.filter(b => b.deadline === target);
  }

  const listNameById = new Map(blocks.filter(b => b.indent === 0).map(b => [b.id, b.text.trim()]));

  return candidates.map(b => ({
    id: b.id,
    text: b.text,
    checked: Boolean(b.checked),
    deadline: b.deadline,
    listName: (b.parentId && listNameById.get(b.parentId)) || 'Uncategorized',
  }));
}

export default function ChatBox({ showReminders, onCloseReminders }: ChatBoxProps) {
  const {
    messages,
    pendingTask,
    isLoading,
    addUserMessage,
    addBotMessage,
    updateTaskTableRow,
    setPendingTask,
    setIsLoading,
  } = useTaskMessaging();

  const handleSendMessage = async (messageToSend: string): Promise<void> => {
    if (!messageToSend.trim()) return;

    // Snapshot conversation so far (before this turn) as short-term context for Waldy.
    const history = messages.slice(-10).map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    addUserMessage(messageToSend);
    setIsLoading(true);

    try {
      const { blocks } = readSelectedProject();
      const lists = blocks
        .filter(b => b.indent === 0 && !isUncTitleBlock(b))
        .map(listBlock => ({
          name: listBlock.text.trim(),
          tasks: blocks
            .filter(b => b.indent > 0 && b.parentId === listBlock.id && b.archived !== true)
            .map(b => ({ text: b.text.trim(), checked: Boolean(b.checked) }))
            .filter(t => t.text),
        }))
        .filter(l => l.name);

      const res = await fetch('/api/waldy/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSend, lists, history }),
      });

      const data: WaldyTaskResponse = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (data.operation === 'add' && data.list && data.block) {
        applyAddTask(data.list, data.block);
        addBotMessage(data.replyMessage || 'Ok ✅');
      } else if ((data.operation === 'check' || data.operation === 'uncheck') && data.task) {
        const applied = applyCheckTask(data.list, data.task, data.operation === 'check');
        addBotMessage(applied ? (data.replyMessage || 'Ok ✅') : `I couldn't find the task "${data.task}".`);
      } else if (data.operation === 'delete' && data.task) {
        const applied = applyDeleteTask(data.list, data.task);
        addBotMessage(applied ? (data.replyMessage || 'Ok ✅') : `I couldn't find the task "${data.task}".`);
      } else if (data.operation === 'list') {
        const { blocks: freshBlocks } = readSelectedProject();
        const rows = buildTaskTableRows(freshBlocks, data.list, data.when);
        addBotMessage(data.replyMessage || "Here's what I found:", rows);
      } else {
        addBotMessage(data.replyMessage || 'Ok ✅');
      }

      setPendingTask(null);
    } catch (err) {
      console.error(err);
      addBotMessage("I couldn't reach Waldy 😅");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTaskRow = (messageId: number, rowId: string, checked: boolean): void => {
    const { blocks, project_id } = readSelectedProject();
    const nextBlocks = updateBlock(blocks, rowId, { checked });
    writeSelectedProjectBlocks(project_id, nextBlocks);
    updateTaskTableRow(messageId, rowId, checked);
  };

  return (
    <div className="relative flex h-full w-full flex-col" style={{ background: 'var(--assistant-bg, #050505)' }}>
      {pendingTask && !showReminders && (
        <div
          className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between border-b px-4 py-2 text-sm shadow-lg"
          style={{
            color: 'var(--assistant-text)',
            borderColor: 'color-mix(in srgb, var(--assistant-tone-1, #52b352) 30%, transparent)',
            background: 'color-mix(in srgb, var(--assistant-tone-1, #52b352) 25%, transparent)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="animate-pulse">💬</span>
            <span className="font-medium">
              Esperando información para: &ldquo;{pendingTask.taskName}&rdquo;
            </span>
          </div>
          <button
            onClick={() => setPendingTask(null)}
            className="font-bold text-lg"
            style={{ color: 'var(--assistant-text-soft)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--assistant-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--assistant-text-soft)')}
            title="Cancelar"
          >
            ✕
          </button>
        </div>
      )}

      {showReminders ? (
        <div className="relative flex-1">
          <button
            onClick={onCloseReminders}
            className="absolute top-4 right-4 z-10 rounded-md px-4 py-2 transition"
            style={{ background: 'var(--assistant-tone-1, #52b352)', color: 'var(--assistant-bg-style)' }}
          >
            back
          </button>
          <RemindersSection onClose={onCloseReminders} />
        </div>
      ) : (
        <ChatSection
          messages={messages}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          onToggleTaskRow={handleToggleTaskRow}
        />
      )}
    </div>
  );
}
