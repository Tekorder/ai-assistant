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
const HHMM = /^\d{2}:\d{2}$/;

const str = (v: unknown, max = 500): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.slice(0, max) : null;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** One client habit → Habit row columns (everything but userId/position). */
function toRow(h: Record<string, unknown>) {
  const goal = typeof h.goalValue === 'number' && Number.isFinite(h.goalValue) && h.goalValue >= 0 ? h.goalValue : 1;
  const days = Array.isArray(h.taskDays)
    ? [...new Set((h.taskDays as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort()
    : [];
  const times = Array.isArray(h.reminderTimes)
    ? [...new Set((h.reminderTimes as unknown[]).filter((t): t is string => typeof t === 'string' && HHMM.test(t)))].sort()
    : [];
  return {
    localId:         typeof h.id === 'string' ? h.id : '',
    text:            typeof h.text === 'string' ? h.text : '',
    description:     str(h.description, 2000),
    emoji:           str(h.emoji, 16),
    color:           str(h.color, 40),
    groupName:       str(h.group, 80),
    kind:            oneOf(h.kind, ['build', 'quit'] as const, 'build'),
    goalPeriod:      oneOf(h.goalPeriod, ['day', 'week', 'month'] as const, 'day'),
    goalValue:       goal,
    goalUnit:        str(h.goalUnit, 24) ?? 'times',
    taskDays:        days,
    timeRange:       oneOf(h.timeRange, ['anytime', 'morning', 'afternoon', 'evening'] as const, 'anytime'),
    remindersOn:     Boolean(h.remindersOn),
    reminderTimes:   times,
    reminderMessage: str(h.reminderMessage, 300),
    flag:            h.flag === 'blue' || h.flag === 'yellow' || h.flag === 'red' ? h.flag : null,
    memoOnComplete:  Boolean(h.memoOnComplete),
    barAction:       oneOf(h.barAction, ['done', 'add'] as const, 'done'),
    chartType:       oneOf(h.chartType, ['bar', 'line'] as const, 'bar'),
    startDate:       typeof h.startDate === 'string' && YMD.test(h.startDate) ? h.startDate : null,
    endDate:         typeof h.endDate === 'string' && YMD.test(h.endDate) ? h.endDate : null,
    archived:        Boolean(h.archived),
    templateKey:     str(h.templateKey, 60),
    createdAt:       typeof h.createdAt === 'string' ? h.createdAt : null,
  };
}

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [habits, meta] = await Promise.all([
    prisma.habit.findMany({
      where: { userId: user.id },
      orderBy: { position: 'asc' },
    }),
    prisma.habitMeta.findUnique({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    habits: habits.map(h => ({
      id:             h.localId,
      text:           h.text,
      kind:           h.kind,
      goalPeriod:     h.goalPeriod,
      goalValue:      h.goalValue,
      goalUnit:       h.goalUnit,
      taskDays:       h.taskDays,
      timeRange:      h.timeRange,
      remindersOn:    h.remindersOn,
      reminderTimes:  h.reminderTimes,
      memoOnComplete: h.memoOnComplete,
      barAction:      h.barAction,
      chartType:      h.chartType,
      archived:       h.archived,
      ...(h.description     ? { description: h.description } : {}),
      ...(h.emoji           ? { emoji: h.emoji } : {}),
      ...(h.color           ? { color: h.color } : {}),
      ...(h.groupName       ? { group: h.groupName } : {}),
      ...(h.reminderMessage ? { reminderMessage: h.reminderMessage } : {}),
      ...(h.flag            ? { flag: h.flag } : {}),
      ...(h.startDate       ? { startDate: h.startDate } : {}),
      ...(h.endDate         ? { endDate: h.endDate } : {}),
      ...(h.templateKey     ? { templateKey: h.templateKey } : {}),
      ...(h.createdAt       ? { createdAt: h.createdAt } : {}),
    })),
    checkInMethod: meta?.checkInMethod === 'swipe' ? 'swipe' : 'tap',
  });
}

export async function POST(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const habits = Array.isArray(body.habits) ? (body.habits as Record<string, unknown>[]) : [];

  // Wipe protection: a fresh device boot-posts an empty list — never let a
  // payload with no real habit text erase existing rows unless the client
  // confirms it synced AFTER hydration.
  const hydrated = req.headers.get('X-Sync-Hydrated') === '1';
  if (!hydrated) {
    const meaningful = habits.some(h => typeof h.text === 'string' && h.text.trim() !== '');
    if (!meaningful) {
      const existing = await prisma.habit.count({ where: { userId: user.id } });
      if (existing > 0) {
        return NextResponse.json({ error: 'empty-payload-rejected' }, { status: 409 });
      }
    }
  }

  const rows = habits.map(toRow).filter(h => h.localId);

  await prisma.$transaction(async (tx) => {
    await tx.habit.deleteMany({ where: { userId: user.id } });

    if (rows.length > 0) {
      await tx.habit.createMany({
        data: rows.map((h, i) => ({ ...h, userId: user.id, position: i })),
        skipDuplicates: true,
      });
    }

    // History of a deleted habit goes with it. Only a client that loaded the
    // server's habits first may decide what's deleted.
    if (hydrated) {
      await tx.habitLog.deleteMany({
        where: { userId: user.id, habitLocalId: { notIn: rows.map(h => h.localId) } },
      });
    }
  });

  if (body.checkInMethod === 'tap' || body.checkInMethod === 'swipe') {
    await prisma.habitMeta.upsert({
      where: { userId: user.id },
      create: { userId: user.id, checkInMethod: body.checkInMethod },
      update: { checkInMethod: body.checkInMethod },
    });
  }

  return NextResponse.json({ ok: true });
}
