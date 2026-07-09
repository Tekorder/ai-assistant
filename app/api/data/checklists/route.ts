import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

async function resolveUser(req: NextRequest) {
  if (!process.env.DATABASE_URL) return null;
  const uid = req.headers.get('X-Firebase-UID') ?? '';
  if (!uid) return null;
  return prisma.user.findUnique({ where: { firebaseUid: uid } });
}

type RawItem = { id?: unknown; text?: unknown; checked?: unknown };

function normalizeItems(raw: unknown): { id: string; text: string; checked: boolean }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawItem[])
    .map(it => ({
      id: typeof it.id === 'string' ? it.id : '',
      text: typeof it.text === 'string' ? it.text : '',
      checked: Boolean(it.checked),
    }))
    .filter(it => it.id);
}

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lists = await prisma.checklist.findMany({
    where: { userId: user.id },
    orderBy: { position: 'asc' },
  });

  return NextResponse.json({
    lists: lists.map(l => ({
      id: l.localId,
      name: l.name,
      items: normalizeItems(l.items),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const lists = Array.isArray(body.lists) ? (body.lists as Record<string, unknown>[]) : [];

  // Wipe protection: never let a payload with no real content erase existing
  // rows unless the client confirms it synced AFTER hydration.
  const hydrated = req.headers.get('X-Sync-Hydrated') === '1';
  if (!hydrated) {
    const meaningful = lists.some(l =>
      (typeof l.name === 'string' && l.name.trim() !== '') ||
      normalizeItems(l.items).some(it => it.text.trim() !== ''),
    );
    if (!meaningful) {
      const existing = await prisma.checklist.count({ where: { userId: user.id } });
      if (existing > 0) {
        return NextResponse.json({ error: 'empty-payload-rejected' }, { status: 409 });
      }
    }
  }

  const toCreate = lists
    .map((l, i) => ({
      userId: user.id,
      localId: typeof l.id === 'string' ? l.id : '',
      name: typeof l.name === 'string' ? l.name : '',
      items: normalizeItems(l.items),
      position: i,
    }))
    .filter(l => l.localId);

  // Full replace in one batch transaction (2 queries) — same pattern as projects.
  await prisma.$transaction([
    prisma.checklist.deleteMany({ where: { userId: user.id } }),
    ...(toCreate.length
      ? [prisma.checklist.createMany({ data: toCreate, skipDuplicates: true })]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
