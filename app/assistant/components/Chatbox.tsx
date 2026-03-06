'use client';

/**
 * Chat Box Component
 * Following BEST_PRACTICES.md:
 * - Component size < 250 lines
 * - Functions < 40 lines
 * - Organized imports
 * - No console.logs in production
 * - Separated concerns (messaging logic extracted)
 */

// External libraries
import React from 'react';

// Internal hooks
import { useReminders } from '../_hook/useReminders';
import { useTaskMessaging } from '../_hook/useTaskMessaging';

// Components
import RemindersSection from './RemindersSection';
import ChatSection from './ChatSection';


// Utils
import {
  validateTaskData,
  getMissingFieldQuestion,
} from '../_utils/taskValidation';
import {
  fetchTaskFromAPI,
  extractTaskData,
  generateTaskResponseMessage,
} from '../_utils/taskMessageProcessor';
import {
  handlePendingTaskCompletion,
  createPendingTaskObject,
} from '../_utils/messageHandlers';

// Constants
import { AZURE_ERROR_03 } from '../../_constants/chatbot.cons';

interface ChatBoxProps {
  showReminders: boolean;
  onCloseReminders: () => void;
}

export default function ChatBox({ showReminders, onCloseReminders }: ChatBoxProps) {
  const { addTaskWithRelationships } = useReminders();
  const {
    messages,
    pendingTask,
    isLoading,
    addUserMessage,
    addBotMessage,
    setPendingTask,
    setIsLoading,
  } = useTaskMessaging();


const JOKES = [
  "¿Qué hace una abeja en el gimnasio? ¡Zum-ba! 🐝",
  "¿Qué le dijo el 0 al 8? Bonito cinturón 😄",
  "¿Cómo se despiden los químicos? Ácido un placer 👋",
  "¿Qué hace un perro con un taladro? Taladrando 🐶",
  "¿Por qué el libro se fue al hospital? Porque tenía muchas páginas en blanco 📚",
];

function pickRandom(arr: string[]) {
  var tarr = arr[Math.floor(Math.random() * arr.length)]
  console.log(tarr);
  return tarr;
}

function tryParseJsonString(s: unknown): any | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function extractAnswerFromN8nResponse(data: any): string | null {
  // n8n a veces responde array
  const root = Array.isArray(data) ? data[0] : data;

  if (!root) return null;

  // Caso ideal: { answer: "..." }
  if (typeof root.answer === "string") return root.answer;

  // Caso: { output: "..." } o [{ output: "..." }]
  if (typeof root.output === "string") {
    // a veces output viene como JSON string
    const parsed = tryParseJsonString(root.output);
    if (parsed) {
      const p0 = Array.isArray(parsed) ? parsed[0] : parsed;
      if (typeof p0?.answer === "string") return p0.answer;
      if (typeof parsed?.answer === "string") return parsed.answer;
    }
    return root.output; // si es texto plano
  }

  // Caso: { replyText: "..." }
  if (typeof root.replyText === "string") return root.replyText;

  // Caso: root es string directo
  if (typeof root === "string") {
    const parsed = tryParseJsonString(root);
    if (parsed?.answer && typeof parsed.answer === "string") return parsed.answer;
    return root;
  }

  // Caso raro: root ya es objeto con answer pero no string (evitar [object Object])
  return null;
}


const handleSendMessage = async (messageToSend: string): Promise<void> => {
  if (!messageToSend.trim()) return;

  addUserMessage(messageToSend);
  setIsLoading(true);

  try {
    // micro delay UX
    await new Promise(r => setTimeout(r, 300));

    const res = await fetch(
      'https://wadu.app.n8n.cloud/webhook/0ecf4992-d5a2-4b58-92d9-42c85787c753',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blocks: localStorage.youtask_blocks_v1,
          message: messageToSend,
        }),
      }
    );

      const data = await res.json();

      const botText = extractAnswerFromN8nResponse(data) ?? "Ok ✅";
      addBotMessage(botText);

    setPendingTask(null);
  } catch (err) {
    console.error(err);
    addBotMessage("No pude contactar al agente 😅");
  } finally {
    setIsLoading(false);
  }
};

/*
  const handleSendMessage = async (messageToSend: string): Promise<void> => {

    if (!messageToSend.trim()) return;

    addUserMessage(messageToSend);
    setIsLoading(true);

    try {
      // CASE 1: Handle pending task completion
      if (pendingTask && pendingTask.missingFields.length > 0) {
        const completionResult = handlePendingTaskCompletion(
          messageToSend,
          pendingTask,
          addTaskWithRelationships
        );

        if (!completionResult.shouldContinue && completionResult.responseText) {
          addBotMessage(completionResult.responseText);
          setPendingTask(null);
          setIsLoading(false);
          return;
        }
      }

      // CASE 2: Fetch task data from Azure API
      const data = await fetchTaskFromAPI(messageToSend);
      const taskData = extractTaskData(data);

      // CASE 3: Validate if all required information is present
      const validation = validateTaskData({
        taskName: taskData.taskName,
        dateToPerform: taskData.dateToPerform,
        itemType: taskData.itemType,
        assignedTo: taskData.assignedTo,
      });

      if (!validation.isValid) {
        // Create pending task and ask for missing information
        const newPendingTask = createPendingTaskObject(
          taskData.taskName,
          taskData.peopleInvolved,
          taskData.taskCategory,
          taskData.dateToPerform,
          taskData.itemType,
          taskData.assignedTo,
          validation.missingFields,
          messageToSend
        );
        setPendingTask(newPendingTask);

        const question = getMissingFieldQuestion(
          validation.missingFields[0],
          taskData.itemType,
          taskData.taskName
        );

        addBotMessage(question);
        setIsLoading(false);
        return;
      }

      // CASE 4: Create task with complete information
      const result = addTaskWithRelationships(
        taskData.taskName,
        taskData.peopleInvolved,
        taskData.taskCategory,
        taskData.dateToPerform,
        taskData.itemType,
        taskData.assignedTo
      );

      const responseText = generateTaskResponseMessage(
        result,
        null,
        data.response?.modelResponse
      ); 

      addBotMessage(responseText);
      setPendingTask(null);
    } catch (error) {
      if (error instanceof Error) {
        // Error logging could be sent to monitoring service
      }
      addBotMessage(AZURE_ERROR_03);
    } finally {
      setIsLoading(false);
    }
  };*/

  return (
    <div className="flex flex-col h-full w-full relative">

    
      {/* Pending conversation indicator */}
      {pendingTask && !showReminders && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-blue-600 text-white px-4 py-2 text-sm flex items-center justify-between shadow-lg">
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
            className="absolute top-4 right-4 z-10 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 transition"
          >
            back
          </button>
          <RemindersSection
            onClose={() => {
              throw new Error('Function not implemented.');
            }}
          />
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
