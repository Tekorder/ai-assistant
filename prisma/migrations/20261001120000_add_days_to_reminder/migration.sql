-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
