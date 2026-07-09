import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

async function resolveUser(req: NextRequest) {
  if (!process.env.DATABASE_URL) return null;
  const uid = req.headers.get('X-Firebase-UID') ?? '';
  if (!uid) return null;
  return prisma.user.findUnique({ where: { firebaseUid: uid } });
}

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reminders = await prisma.reminder.findMany({
    where: { userId: user.id },
    orderBy: { position: 'asc' },
  });

  return NextResponse.json({
    reminders: reminders.map(r => ({
      id:    r.localId,
      title: r.title,
      date:  r.date,
      time:  r.time,
      daily: r.daily,
      ...(r.flag ? { flag: r.flag } : {}),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const reminders = Array.isArray(body.reminders)
    ? (body.reminders as Record<string, unknown>[])
    : [];

  // Wipe protection: a fresh device boot-posts one blank reminder — never let
  // a payload with no real reminder titles erase existing rows unless the
  // client confirms it synced AFTER hydration.
  const hydrated = req.headers.get('X-Sync-Hydrated') === '1';
  if (!hydrated) {
    const meaningful = reminders.some(r => typeof r.title === 'string' && r.title.trim() !== '');
    if (!meaningful) {
      const existing = await prisma.reminder.count({ where: { userId: user.id } });
      if (existing > 0) {
        return NextResponse.json({ error: 'empty-payload-rejected' }, { status: 409 });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.reminder.deleteMany({ where: { userId: user.id } });

    if (reminders.length > 0) {
      await tx.reminder.createMany({
        data: reminders.map((r, i) => ({
          userId:   user.id,
          localId:  typeof r.id === 'string' ? r.id : '',
          title:    typeof r.title === 'string' ? r.title : '',
          date:     typeof r.date === 'string' ? r.date : '',
          time:     typeof r.time === 'string' ? r.time : '11:00',
          daily:    Boolean(r.daily),
          position: i,
          flag:     typeof r.flag === 'string' ? r.flag : null,
        })).filter(r => r.localId && r.date),
      });
    }
  });

  return NextResponse.json({ ok: true });
}
