import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: true });
  const uid = req.headers.get('X-Firebase-UID') ?? '';
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.user.update({ where: { firebaseUid: uid }, data: { onboarded: true } });
  return NextResponse.json({ ok: true });
}
