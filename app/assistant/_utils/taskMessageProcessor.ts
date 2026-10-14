/**
 * Task message processing utilities
 * Following BEST_PRACTICES.md: Functions < 40 lines, Type safety
 */

import type { PendingTask } from '../_types/PendingTask';

/**
 * Generates response message based on task action result
 */
export function generateTaskResponseMessage(
  result: { action: 'created' | 'updated' | 'kept_existing'; taskName: string; similarity?: number },
  pendingTask: PendingTask | null,
  modelResponse?: string
): string {
  const similarityPercent = Math.round((result.similarity || 0) * 100);

  if (result.action === 'updated') {
    return `✏️ I've updated the existing task "${result.taskName}" with new information (similarity: ${similarityPercent}%).`;
  }

  if (result.action === 'kept_existing') {
    return `🛡️ You already have a similar task "${result.taskName}" with more information. I've kept the more complete version (similarity: ${similarityPercent}%).`;
  }

  // Created
  if (pendingTask) {
    const itemType = getItemTypeName(pendingTask.itemType);
    return `✅ Perfect, ${itemType} created: "${pendingTask.taskName}".`;
  }

  return `✅ ${modelResponse || 'Task created successfully.'}`;
}

/**
 * Gets friendly name for item type
 */
function getItemTypeName(itemType: string): string {
  const translations: Record<string, string> = {
    task: 'task',
    project: 'project',
    habit: 'habit',
  };

  return translations[itemType.toLowerCase()] || 'task';
}
