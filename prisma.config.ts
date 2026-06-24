import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same source of truth as Next.js: project root `.env` only.
config({ path: path.resolve('.env') });

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.DATABASE_URL_DEV?.trim() ||
  process.env.DATABASE_URL_PROD?.trim() ||
  'postgresql://localhost:5432/youtask';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: databaseUrl,
  },
});