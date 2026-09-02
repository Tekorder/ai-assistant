/**
 * Custom hook for task messaging logic
 * Following BEST_PRACTICES.md: Functions < 40 lines, Separation of concerns
 */

import { useCallback, useEffect, useState } from 'react';
import type { Message, TaskTableRow } from '../_types/Message';
import type { PendingTask } from '../_types/PendingTask';
import { GREETING } from '../../_constants/chatbot.cons';

export const WALDY_CHAT_STORAGE_KEY = 'waldy_chat_messages_v1';
/** Dispatched by the UI (e.g. the trash icon next to the chat's close button) after the user confirms. */
export const WALDY_CLEAR_CHAT_EVENT = 'waldy_clear_chat';

const initialMessages: Message[] = [{ id: 1, text: GREETING, sender: 'bot' }];

function readStoredMessages(): Message[] {
  if (typeof window === 'undefined') return initialMessages;
  try {
    const raw = localStorage.getItem(WALDY_CHAT_STORAGE_KEY);
    if (!raw) return initialMessages;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : initialMessages;
  } catch {
    return initialMessages;
  }
}

interface UseTaskMessagingReturn {
  messages: Message[];
  pendingTask: PendingTask | null;
  isLoading: boolean;
  addUserMessage: (text: string) => void;
  addBotMessage: (text: string, taskTable?: TaskTableRow[]) => void;
  updateTaskTableRow: (messageId: number, rowId: string, checked: boolean) => void;
  clearMessages: () => void;
  setPendingTask: (task: PendingTask | null) => void;
  setIsLoading: (loading: boolean) => void;
}

export function useTaskMessaging(): UseTaskMessagingReturn {
  const [messages, setMessages] = useState<Message[]>(readStoredMessages);
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(WALDY_CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  const addUserMessage = (text: string): void => {
    const userMessage: Message = {
      id: Date.now(),
      text,
      sender: 'user',
    };
    setMessages(prev => [...prev, userMessage]);
  };

  const addBotMessage = (text: string, taskTable?: TaskTableRow[]): void => {
    const botMessage: Message = {
      id: Date.now() + 1,
      text,
      sender: 'bot',
      ...(taskTable && taskTable.length ? { taskTable } : {}),
    };
    setMessages(prev => [...prev, botMessage]);
  };

  const updateTaskTableRow = (messageId: number, rowId: string, checked: boolean): void => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId && m.taskTable
          ? { ...m, taskTable: m.taskTable.map(r => (r.id === rowId ? { ...r, checked } : r)) }
          : m,
      ),
    );
  };

  const clearMessages = useCallback((): void => {
    setMessages(initialMessages);
    try {
      localStorage.removeItem(WALDY_CHAT_STORAGE_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    window.addEventListener(WALDY_CLEAR_CHAT_EVENT, clearMessages);
    return () => window.removeEventListener(WALDY_CLEAR_CHAT_EVENT, clearMessages);
  }, [clearMessages]);

  return {
    messages,
    pendingTask,
    isLoading,
    addUserMessage,
    addBotMessage,
    updateTaskTableRow,
    clearMessages,
    setPendingTask,
    setIsLoading,
  };
}
