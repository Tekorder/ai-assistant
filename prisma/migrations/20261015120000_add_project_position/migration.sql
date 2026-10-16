-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: keep each user's current order (creation order) as the starting position
UPDATE "Project" AS p
SET "position" = r.rn
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "rowCreatedAt") - 1)::INTEGER AS rn
  FROM "Project"
) AS r
WHERE p."id" = r."id";

-- CreateIndex
CREATE INDEX "Project_userId_position_idx" ON "Project"("userId", "position");
