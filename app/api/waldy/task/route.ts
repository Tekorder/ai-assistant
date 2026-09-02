import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

const WALDY_PERSONA =
  'Your name is Waldy. If asked your name, say you are Waldy. ' +
  'You must respond only in English, strictly and exclusively — never in Spanish or any other ' +
  'language, regardless of what language the user writes in.';

interface TaskListInput {
  name?: unknown;
  tasks?: { text?: unknown; checked?: unknown }[];
}

interface HistoryTurn {
  role?: unknown;
  content?: unknown;
}

function buildListsText(lists: unknown): string {
  if (!Array.isArray(lists)) return '(no lists yet)';

  const lines = (lists as TaskListInput[])
    .map(l => {
      const name = typeof l?.name === 'string' ? l.name.trim() : '';
      if (!name) return null;
      const tasks = Array.isArray(l.tasks) ? l.tasks : [];
      const taskParts = tasks
        .map(t => {
          const text = typeof t?.text === 'string' ? t.text.trim() : '';
          if (!text) return null;
          return `${text} (${t?.checked ? 'done' : 'pending'})`;
        })
        .filter((s): s is string => Boolean(s));
      return taskParts.length ? `${name}: ${taskParts.join(', ')}` : `${name}: (no tasks yet)`;
    })
    .filter((s): s is string => Boolean(s));

  return lines.length ? lines.join('; ') : '(no lists yet)';
}

function buildHistoryMessages(history: unknown): Anthropic.MessageParam[] {
  if (!Array.isArray(history)) return [];

  const result: Anthropic.MessageParam[] = [];
  for (const h of (history as HistoryTurn[]).slice(-10)) {
    const content = typeof h?.content === 'string' ? h.content.trim() : '';
    if (!content) continue;
    const role: 'user' | 'assistant' = h?.role === 'assistant' ? 'assistant' : 'user';
    result.push({ role, content });
  }
  return result;
}

function buildTaskSystemPrompt(lists: unknown): string {
  const today = new Date().toISOString().slice(0, 10);
  const listsText = buildListsText(lists);

  return (
    `${WALDY_PERSONA} Today's date is ${today}. The user's current lists and their tasks are: ${listsText}. ` +
    "Read the user's message (and the recent conversation history, if any) and decide what to do. " +
    'Respond ONLY with a single JSON object and nothing else, matching exactly this shape: ' +
    '{"replyMessage": string, "operation": "add" or "check" or "uncheck" or "delete" or "list" or "none", ' +
    '"list": string or null, "task": string or null, "when": "today" or "tomorrow" or "all" or null, ' +
    '"block": {"text": string, "deadline": "YYYY-MM-DD"} or null}. ' +
    '- If the user asks to add a new task: operation="add"; list = best matching list name from ' +
    'above (reuse one exactly if it fits, otherwise a short new list name); block.text = just the ' +
    `task description (no list name or date phrase in it); block.deadline = ${today} by default, ` +
    "unless the user says 'tomorrow' (add one day) or names a day of the month like 'the 15th' " +
    '(assume that day in the current month); task=null; when=null. ' +
    '- If the user asks to mark an existing task as done/completed: operation="check"; ' +
    "list = the list it belongs to if known, else null; task = that task's text exactly as given " +
    'above; block=null; when=null. ' +
    '- If the user asks to undo/reopen/mark a task as not done: operation="uncheck"; same fields ' +
    'as check. ' +
    '- If the user asks to delete/remove a single existing task: operation="delete"; ' +
    "list = the list it belongs to if known, else null; task = that task's text exactly as given " +
    'above; block=null; when=null. ' +
    '- There is no way to delete an entire list — if the user asks to delete/remove a whole list ' +
    '(not a single task), do NOT set operation to "delete"; instead use operation="none" and ' +
    "explain in replyMessage that deleting a whole list isn't supported yet. " +
    "- If the user asks what tasks they have, or asks to see/list their tasks (e.g. 'what are my " +
    "tasks today', 'show me tomorrow', 'what's on my plate', 'list my marketing tasks'): " +
    'operation="list"; when = "today", "tomorrow", or "all" depending on what they asked ' +
    '(default "today" when they don\'t specify a day); list = a specific list name if they asked ' +
    'about one particular list, else null; task=null; block=null. ' +
    '- Otherwise: operation="none"; list=null; task=null; when=null; block=null. ' +
    'replyMessage must always be a short, friendly confirmation or reply in English — never the raw JSON.'
  );
}

interface WaldyTaskResult {
  replyMessage: string;
  operation: string;
  list: string | null;
  task: string | null;
  when: string | null;
  block: { text: string; deadline: string } | null;
}

async function callClaude(message: string, lists: unknown, history: unknown): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 });
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: buildTaskSystemPrompt(lists),
    messages: [...buildHistoryMessages(history), { role: 'user', content: message }],
  });

  if (response.stop_reason === 'refusal') {
    return NextResponse.json({ error: 'Waldy declined to respond to that message.' }, { status: 502 });
  }

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'Claude did not return a text response' }, { status: 502 });
  }

  let parsed: WaldyTaskResult;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return NextResponse.json({ error: 'Claude did not return valid JSON', raw: textBlock.text }, { status: 502 });
  }

  return NextResponse.json({
    replyMessage: parsed.replyMessage ?? '',
    operation: parsed.operation ?? 'none',
    list: parsed.list ?? null,
    task: parsed.task ?? null,
    when: parsed.when ?? null,
    block: parsed.block ?? null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  try {
    return await callClaude(message, body.lists, body.history);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
