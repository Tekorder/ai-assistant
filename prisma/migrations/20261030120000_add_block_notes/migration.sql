-- AlterTable: dated notes on a task, newest first. The old "note" column stays (mirrors the newest entry).
ALTER TABLE "Block" ADD COLUMN     "notes" JSONB NOT NULL DEFAULT '[]';

-- Backfill: each existing single note becomes the first entry, dated the task's creation day
UPDATE "Block"
SET "notes" = jsonb_build_array(jsonb_build_object(
  'id',   'n' || "localId",
  'text', "note",
  'date', CASE WHEN "createdAt" ~ '^\d{4}-\d{2}-\d{2}$' THEN "createdAt" ELSE to_char(now(), 'YYYY-MM-DD') END
))
WHERE "note" IS NOT NULL AND btrim("note") <> '' AND "notes" = '[]'::jsonb;
