'use client';

// External libraries
import React from 'react';

// Internal hooks
import { useTaskMessaging } from '../_hook/useTaskMessaging';

// Components
import RemindersSection from './RemindersSection';
import ChatSection from './ChatSection';

interface ChatBoxProps {
  showReminders: boolean;
  onCloseReminders: () => void;
}

function tryParseJsonString(s: unknown): Record<string, unknown> | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  if (!(t.startsWith('{') || t.startsWith('['))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function extractAnswerFromN8nResponse(data: unknown): string | null {
  const root = Array.isArray(data) ? data[0] : data;
  if (!root || typeof root !== 'object') return null;

  const r = root as Record<string, unknown>;

  if (typeof r.answer === 'string') return r.answer;

  if (typeof r.output === 'string') {
    const parsed = tryParseJsonString(r.output);
    if (parsed) {
      const p0 = Array.isArray(parsed) ? parsed[0] : parsed;
      const p0r = p0 as Record<string, unknown>;
      if (typeof p0r?.answer === 'string') return p0r.answer;
      if (typeof parsed?.answer === 'string') return parsed.answer as string;
    }
    return r.output;
  }

  if (typeof r.replyText === 'string') return r.replyText;

  return null;
}

export default function ChatBox({ showReminders, onCloseReminders }: ChatBoxProps) {
  const {
    messages,
    pendingTask,
    isLoading,
    addUserMessage,
    addBotMessage,
    setPendingTask,
    setIsLoading,
  } = useTaskMessaging();

  const handleSendMessage = async (messageToSend: string): Promise<void> => {
    if (!messageToSend.trim()) return;

    addUserMessage(messageToSend);
    setIsLoading(true);

    try {
      await new Promise(r => setTimeout(r, 300));

      const res = await fetch(
        'https://wadu.app.n8n.cloud/webhook/0ecf4992-d5a2-4b58-92d9-42c85787c753',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blocks: localStorage.youtask_blocks_v1,
            message: messageToSend,
          }),
        }
      );

      const data: unknown = await res.json();
      const botText = extractAnswerFromN8nResponse(data) ?? 'Ok ✅';
      addBotMessage(botText);
      setPendingTask(null);
    } catch (err) {
      console.error(err);
      addBotMessage('No pude contactar al agente 😅');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col" style={{ background: 'var(--assistant-bg, #050505)' }}>
      {pendingTask && !showReminders && (
        <div
          className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between border-b px-4 py-2 text-sm text-white shadow-lg"
          style={{
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
            className="text-white hover:text-gray-200 font-bold text-lg"
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
            className="absolute top-4 right-4 z-10 rounded-md px-4 py-2 text-white transition"
            style={{ background: 'var(--assistant-tone-1, #52b352)' }}
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
        />
      )}
    </div>
  );
}
