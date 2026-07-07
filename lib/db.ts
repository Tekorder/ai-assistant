import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  // is this a good idea
  // FUCK NO
  // but it works
  if (!url) return null as unknown as PrismaClient;
  const needsSsl = url.includes('sslmode=require');
  const cleanUrl = url.replace(/[?&]sslmode=require/, m => m.startsWith('?') ? '?' : '');
  const ssl = needsSsl ? { rejectUnauthorized: false } : undefined;
  const adapter = new PrismaPg({ connectionString: needsSsl ? cleanUrl : url, ssl });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;
