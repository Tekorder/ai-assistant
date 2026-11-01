import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

async function resolveUser(req: NextRequest) {
  if (!process.env.DATABASE_URL) return null;
  const uid = req.headers.get('X-Firebase-UID') ?? '';
  if (!uid) return null;
  return prisma.user.findUnique({ where: { firebaseUid: uid } });
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OPS = 5000;

type LogKey = { habitLocalId: string; date: string };

function parseKey(raw: Record<string, unknown>): LogKey | null {
  const habitLocalId = typeof raw.habitId === 'string' ? raw.habitId : '';
  const date = typeof raw.date === 'string' ? raw.date : '';
  return habitLocalId && YMD.test(date) ? { habitLocalId, date } : null;
}

/** Every day logged for every habit (history isn't paged — a few rows per habit per day). */
export async function GET(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const logs = await prisma.habitLog.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
    select: { habitLocalId: true, date: true, value: true, skipped: true, memo: true },
  });

  return NextResponse.json({
    logs: logs.map(l => ({
      habitId: l.habitLocalId,
      date:    l.date,
      value:   l.value,
      ...(l.skipped ? { skipped: true } : {}),
      ...(l.memo ? { memo: l.memo } : {}),
    })),
  });
}

/**
 * Applies the device's pending changes, not the whole history:
 *   { upserts: [{ habitId, date, value, skipped?, memo? }], deletes: [{ habitId, date }] }
 * Unlike the other datasets nothing is wiped, so a stale device can't erase history.
 */
export async function POST(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const rawUpserts = Array.isArray(body.upserts) ? (body.upserts as Record<string, unknown>[]) : [];
  const rawDeletes = Array.isArray(body.deletes) ? (body.deletes as Record<string, unknown>[]) : [];
  if (rawUpserts.length + rawDeletes.length > MAX_OPS) {
    return NextResponse.json({ error: 'too-many-ops' }, { status: 413 });
  }

  const upserts = rawUpserts.flatMap(raw => {
    const key = parseKey(raw);
    if (!key) return [];
    const value = typeof raw.value === 'number' && Number.isFinite(raw.value) && raw.value >= 0 ? raw.value : 0;
    const memo = typeof raw.memo === 'string' && raw.memo.trim() !== '' ? raw.memo.slice(0, 4000) : null;
    return [{ ...key, value, skipped: Boolean(raw.skipped), memo }];
  });
  const deletes = rawDeletes.map(parseKey).filter((k): k is LogKey => k !== null);

  await prisma.$transaction([
    ...deletes.map(k => prisma.habitLog.deleteMany({ where: { userId: user.id, ...k } })),
    ...upserts.map(({ habitLocalId, date, ...data }) => prisma.habitLog.upsert({
      where: { userId_habitLocalId_date: { userId: user.id, habitLocalId, date } },
      create: { userId: user.id, habitLocalId, date, ...data },
      update: data,
    })),
  ]);

  return NextResponse.json({ ok: true });
}
