-- AlterTable: urgency flag on a habit's reminders (blue | yellow | red), like tasks and reminders have
ALTER TABLE "Habit" ADD COLUMN     "flag" TEXT;
