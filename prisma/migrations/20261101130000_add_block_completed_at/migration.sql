-- AlterTable: the day a task was checked. Reports, Timeline and Calendar place done tasks by it;
-- checking a task no longer moves its due date to the completion day.
ALTER TABLE "Block" ADD COLUMN     "completedAt" TEXT;

-- Backfill so nobody loses their history: until now checking a task moved its due date to the
-- day it was checked, so a done task's due date is its completion day. Done tasks without a
-- valid due date fall back to their creation day. Open tasks (and lists) stay NULL.
UPDATE "Block"
SET "completedAt" = CASE
  WHEN "deadline"  ~ '^\d{4}-\d{2}-\d{2}$' THEN "deadline"
  WHEN "createdAt" ~ '^\d{4}-\d{2}-\d{2}$' THEN "createdAt"
  ELSE to_char(now(), 'YYYY-MM-DD')
END
WHERE "checked" = true
  AND "indent" > 0
  AND "isSection" = false
  AND "completedAt" IS NULL;

-- Reports read done tasks by completion day
CREATE INDEX "Block_completedAt_idx" ON "Block"("completedAt");
