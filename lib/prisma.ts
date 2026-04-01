import { PrismaClient } from '@prisma/client'; //Module '"@prisma/client"' has no exported member 'PrismaClient'.ts(2305)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;