/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `aiContext` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Entity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EntityInteraction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Task` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaskEntity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaskEvent` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,localId]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `localId` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rowUpdatedAt` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rowUpdatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Entity" DROP CONSTRAINT "Entity_userId_fkey";

-- DropForeignKey
ALTER TABLE "EntityInteraction" DROP CONSTRAINT "EntityInteraction_entityId_fkey";

-- DropForeignKey
ALTER TABLE "EntityInteraction" DROP CONSTRAINT "EntityInteraction_taskId_fkey";

-- DropForeignKey
ALTER TABLE "EntityInteraction" DROP CONSTRAINT "EntityInteraction_userId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_userId_fkey";

-- DropForeignKey
ALTER TABLE "TaskEntity" DROP CONSTRAINT "TaskEntity_entityId_fkey";

-- DropForeignKey
ALTER TABLE "TaskEntity" DROP CONSTRAINT "TaskEntity_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskEvent" DROP CONSTRAINT "TaskEvent_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskEvent" DROP CONSTRAINT "TaskEvent_userId_fkey";

-- DropIndex
DROP INDEX "Project_userId_isArchived_idx";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "createdAt",
DROP COLUMN "description",
DROP COLUMN "updatedAt",
ADD COLUMN     "collapsed" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "localId" TEXT NOT NULL,
ADD COLUMN     "quickCollapsed" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "rowCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rowUpdatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "aiContext",
DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "rowCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rowUpdatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "selectedProjectLocalId" TEXT;

-- DropTable
DROP TABLE "Entity";

-- DropTable
DROP TABLE "EntityInteraction";

-- DropTable
DROP TABLE "Task";

-- DropTable
DROP TABLE "TaskEntity";

-- DropTable
DROP TABLE "TaskEvent";

-- DropEnum
DROP TYPE "EntityType";

-- DropEnum
DROP TYPE "TaskEventType";

-- DropEnum
DROP TYPE "TaskPriority";

-- DropEnum
DROP TYPE "TaskStatus";

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "indent" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "checked" BOOLEAN,
    "deadline" TEXT,
    "createdAt" TEXT,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "rowCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "weekly" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT,
    "rowCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitMeta" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastDailyResetYMD" TEXT,
    "lastWeeklyResetYMD" TEXT,
    "rowCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "daily" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT,
    "rowCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_projectId_position_idx" ON "Block"("projectId", "position");

-- CreateIndex
CREATE INDEX "Block_projectId_idx" ON "Block"("projectId");

-- CreateIndex
CREATE INDEX "Block_deadline_idx" ON "Block"("deadline");

-- CreateIndex
CREATE INDEX "Block_archived_idx" ON "Block"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "Block_projectId_localId_key" ON "Block"("projectId", "localId");

-- CreateIndex
CREATE INDEX "Habit_userId_position_idx" ON "Habit"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Habit_userId_localId_key" ON "Habit"("userId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitMeta_userId_key" ON "HabitMeta"("userId");

-- CreateIndex
CREATE INDEX "Reminder_userId_date_idx" ON "Reminder"("userId", "date");

-- CreateIndex
CREATE INDEX "Reminder_userId_position_idx" ON "Reminder"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_userId_localId_key" ON "Reminder"("userId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_userId_localId_key" ON "Project"("userId", "localId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitMeta" ADD CONSTRAINT "HabitMeta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
