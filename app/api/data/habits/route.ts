import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

async function resolveUser(req: NextRequest) {
  const uid = req.headers.get('X-Firebase-UID') ?? '';
  if (!uid) return null;
  return prisma.user.findUnique({ where: { firebaseUid: uid } });
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
      id:     h.localId,
      text:   h.text,
      indent: 1 as const,
      checked: h.checked,
      weekly:  h.weekly,
    })),
    lastDailyResetYMD:  meta?.lastDailyResetYMD  ?? undefined,
    lastWeeklyResetYMD: meta?.lastWeeklyResetYMD ?? undefined,
  });
}

export async function POST(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const habits = Array.isArray(body.habits) ? (body.habits as Record<string, unknown>[]) : [];

  await prisma.$transaction(async (tx) => {
    await tx.habit.deleteMany({ where: { userId: user.id } });

    if (habits.length > 0) {
      await tx.habit.createMany({
        data: habits.map((h, i) => ({
          userId:   user.id,
          localId:  typeof h.id === 'string' ? h.id : '',
          text:     typeof h.text === 'string' ? h.text : '',
          checked:  Boolean(h.checked),
          weekly:   Boolean(h.weekly),
          position: i,
        })).filter(h => h.localId),
      });
    }
  });

  await prisma.habitMeta.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      lastDailyResetYMD:  typeof body.lastDailyResetYMD  === 'string' ? body.lastDailyResetYMD  : null,
      lastWeeklyResetYMD: typeof body.lastWeeklyResetYMD === 'string' ? body.lastWeeklyResetYMD : null,
    },
    update: {
      lastDailyResetYMD:  typeof body.lastDailyResetYMD  === 'string' ? body.lastDailyResetYMD  : null,
      lastWeeklyResetYMD: typeof body.lastWeeklyResetYMD === 'string' ? body.lastWeeklyResetYMD : null,
    },
  });

  return NextResponse.json({ ok: true });
}
