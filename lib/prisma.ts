// Re-export from the canonical client so both @/lib/prisma and @/lib/db resolve the same singleton.
export { prisma } from './db';
