-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "barAction" TEXT NOT NULL DEFAULT 'done',
ADD COLUMN     "chartType" TEXT NOT NULL DEFAULT 'bar',
ADD COLUMN     "color" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "emoji" TEXT,
ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "goalPeriod" TEXT NOT NULL DEFAULT 'day',
ADD COLUMN     "goalUnit" TEXT NOT NULL DEFAULT 'times',
ADD COLUMN     "goalValue" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'build',
ADD COLUMN     "memoOnComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderMessage" TEXT,
ADD COLUMN     "reminderTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "remindersOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startDate" TEXT,
ADD COLUMN     "taskDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "templateKey" TEXT,
ADD COLUMN     "timeRange" TEXT NOT NULL DEFAULT 'anytime';

-- AlterTable
ALTER TABLE "HabitMeta" ADD COLUMN     "checkInMethod" TEXT NOT NULL DEFAULT 'tap';

-- CreateTable
CREATE TABLE "HabitLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "habitLocalId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "rowCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitLog_userId_date_idx" ON "HabitLog"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HabitLog_userId_habitLocalId_date_key" ON "HabitLog"("userId", "habitLocalId", "date");

-- AddForeignKey
ALTER TABLE "HabitLog" ADD CONSTRAINT "HabitLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (habits v1 → v2). Old rows keep working: "checked"/"weekly" and the
-- HabitMeta reset dates stay in place, they're just no longer read by the app.

-- 1. v1 always kept one blank placeholder row; v2 has no placeholders
DELETE FROM "Habit" WHERE btrim("text") = '';

-- 2. A "Weekly" habit becomes a once-per-week goal
UPDATE "Habit" SET "goalPeriod" = 'week' WHERE "weekly" = true;

-- 3. Due days start when the habit was (last) saved — v1 never set createdAt —
--    or on its backfilled check-in day (step 4), whichever is earlier
UPDATE "Habit" h
SET "startDate" = LEAST(
  to_char(h."rowCreatedAt", 'YYYY-MM-DD'),
  COALESCE(CASE WHEN m."lastDailyResetYMD" ~ '^\d{4}-\d{2}-\d{2}$' THEN m."lastDailyResetYMD" END, '9999-12-31')
)
FROM "Habit" h2
LEFT JOIN "HabitMeta" m ON m."userId" = h2."userId"
WHERE h2."id" = h."id" AND h."startDate" IS NULL;

-- 4. A habit checked in v1 is done on the day that check belonged to: the user's
--    last daily reset (the last day the app was opened), else the row's last save
INSERT INTO "HabitLog" ("id", "userId", "habitLocalId", "date", "value", "skipped", "rowCreatedAt", "rowUpdatedAt")
SELECT gen_random_uuid()::text, h."userId", h."localId",
       CASE WHEN m."lastDailyResetYMD" ~ '^\d{4}-\d{2}-\d{2}$' THEN m."lastDailyResetYMD"
            ELSE to_char(h."rowUpdatedAt", 'YYYY-MM-DD') END,
       1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Habit" h
LEFT JOIN "HabitMeta" m ON m."userId" = h."userId"
WHERE h."checked" = true
ON CONFLICT ("userId", "habitLocalId", "date") DO NOTHING;
