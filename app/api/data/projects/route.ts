import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Block as PrismaBlock } from '@prisma/client';
import { isDefaultGroup, parseListStatus, parseRepeatDays } from '@/lib/datacenter';

function getUid(req: NextRequest) {
  return req.headers.get('X-Firebase-UID') ?? '';
}

async function resolveUser(req: NextRequest) {
  if (!process.env.DATABASE_URL) return null;
  const uid = getUid(req);
  if (!uid) return null;
  return prisma.user.findUnique({ where: { firebaseUid: uid } });
}

// Re-order flat block array so normalizeLoadedBlocks walks in the correct parent→child sequence.
function sortBlocksFlat(blocks: PrismaBlock[]): PrismaBlock[] {
  const roots = blocks.filter(b => !b.parentLocalId).sort((a, b) => a.order - b.order);
  const childrenOf = new Map<string, PrismaBlock[]>();
  for (const b of blocks) {
    if (b.parentLocalId) {
      const arr = childrenOf.get(b.parentLocalId) ?? [];
      arr.push(b);
      childrenOf.set(b.parentLocalId, arr);
    }
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => a.order - b.order);

  const result: PrismaBlock[] = [];
  const seen = new Set<string>();
  function emit(b: PrismaBlock) {
    result.push(b);
    seen.add(b.localId);
    for (const child of childrenOf.get(b.localId) ?? []) emit(child);
  }
  for (const r of roots) emit(r);
  for (const b of blocks) if (!seen.has(b.localId)) result.push(b);
  return result;
}

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    include: { blocks: true },
    orderBy: [{ position: 'asc' }, { rowCreatedAt: 'asc' }],
  });

  // Done occurrences of recurring tasks, by task
  const completions = await prisma.taskCompletion.findMany({
    where: { userId: user.id },
    select: { taskLocalId: true, date: true },
  });
  const doneByTask = new Map<string, string[]>();
  for (const c of completions) {
    const arr = doneByTask.get(c.taskLocalId) ?? [];
    arr.push(c.date);
    doneByTask.set(c.taskLocalId, arr);
  }

  return NextResponse.json({
    onboarded: user.onboarded,
    groupsSeeded: user.groupsSeeded,
    projects: projects.map(p => ({
      project_id: p.localId,
      title: p.title,
      collapsed: p.collapsed,
      quickCollapsed: p.quickCollapsed,
      visibleLists: p.visibleLists,
      blocks: sortBlocksFlat(p.blocks).map(b => ({
        id: b.localId,
        text: b.text,
        indent: b.indent,
        parentId: b.parentLocalId ?? null,
        order: b.order,
        ...(b.checked != null ? { checked: b.checked } : {}),
        ...(b.deadline ? { deadline: b.deadline } : {}),
        ...(b.dueTime ? { dueTime: b.dueTime } : {}),
        ...(b.repeatDays.length ? { repeatDays: b.repeatDays } : {}),
        ...(b.isSection ? { section: true } : {}),
        ...(doneByTask.has(b.localId) ? { doneDates: doneByTask.get(b.localId)!.sort() } : {}),
        ...(b.createdAt ? { createdAt: b.createdAt } : {}),
        ...(b.isHidden ? { isHidden: b.isHidden } : {}),
        ...(b.archived ? { archived: b.archived } : {}),
        ...(b.onHold ? { onHold: b.onHold } : {}),
        ...(b.flag ? { flag: b.flag } : {}),
        ...(b.listStatus ? { listStatus: b.listStatus } : {}),
        ...(b.note ? { note: b.note } : {}),
      })),
    })),
    selectedProjectId: user.selectedProjectLocalId ?? undefined,
  });
}

export async function POST(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const projects = Array.isArray(body.projects) ? (body.projects as Record<string, unknown>[]) : [];

  // Wipe protection: a payload holding no real data (only Uncategorized titles /
  // blank blocks — the boot state of a fresh device) must not replace existing
  // server data unless the client confirms it synced AFTER hydration.
  const hydrated = req.headers.get('X-Sync-Hydrated') === '1';
  if (!hydrated) {
    // Devices boot with the starter groups, so only a custom group counts as data
    const meaningful = projects.some(p => !isDefaultGroup({ title: String(p.title ?? '') })) || projects.some(p => {
      const blocks = Array.isArray(p.blocks) ? (p.blocks as Record<string, unknown>[]) : [];
      return blocks.some(b => {
        const text = typeof b.text === 'string' ? b.text.trim() : '';
        return text !== '' && text.toLowerCase() !== 'uncategorized';
      });
    });
    if (!meaningful) {
      const existing = await prisma.project.count({ where: { userId: user.id } });
      if (existing > 0) {
        return NextResponse.json({ error: 'empty-payload-rejected' }, { status: 409 });
      }
    }
  }

  // Every task in the payload, and the done occurrences of the ones that send them
  const seenTaskIds = new Set<string>();
  const incomingDone = new Map<string, Set<string>>();

  for (const [position, rawProj] of projects.entries()) {
    const localId = typeof rawProj.project_id === 'string' ? rawProj.project_id : '';
    if (!localId) continue;

    const project = await prisma.project.upsert({
      where: { userId_localId: { userId: user.id, localId } },
      create: {
        userId: user.id,
        localId,
        position,
        title: typeof rawProj.title === 'string' ? rawProj.title : 'Project',
        collapsed:      (rawProj.collapsed as object)      ?? {},
        quickCollapsed: (rawProj.quickCollapsed as object) ?? {},
        visibleLists:   (rawProj.visibleLists as object)   ?? {},
      },
      update: {
        position,
        title:          typeof rawProj.title === 'string' ? rawProj.title : 'Project',
        collapsed:      (rawProj.collapsed as object)      ?? {},
        quickCollapsed: (rawProj.quickCollapsed as object) ?? {},
        visibleLists:   (rawProj.visibleLists as object)   ?? {},
      },
    });

    const blocks = Array.isArray(rawProj.blocks)
      ? (rawProj.blocks as Record<string, unknown>[])
      : [];

    // Derive parentLocalId from the flat array order + indent level.
    // The parent of a block at indent N is the most recent preceding block at indent N-1.
    const parentStack: Record<number, string> = {};
    const toCreate = blocks
      .map(b => {
        const bLocalId = typeof b.id === 'string' ? b.id : '';
        if (!bLocalId) return null;
        const indent = Number(b.indent ?? 0);
        const parentLocalId = indent > 0 ? (parentStack[indent - 1] ?? null) : null;
        parentStack[indent] = bLocalId;
        for (const key in parentStack) { if (Number(key) > indent) delete parentStack[key]; }
        if (indent > 0) {
          seenTaskIds.add(bLocalId);
          if (Array.isArray(b.doneDates)) {
            incomingDone.set(bLocalId, new Set(
              (b.doneDates as unknown[]).filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)),
            ));
          }
        }
        return {
          projectId:     project.id,
          localId:       bLocalId,
          parentLocalId,
          text:          String(b.text ?? ''),
          indent,
          order:         Number(b.order ?? 0),
          checked:       typeof b.checked === 'boolean' ? b.checked : null,
          deadline:      typeof b.deadline === 'string' ? b.deadline : null,
          dueTime:       indent > 0 && typeof b.dueTime === 'string' && /^\d{2}:\d{2}$/.test(b.dueTime) ? b.dueTime : null,
          repeatDays:    indent > 0 ? parseRepeatDays(b.repeatDays) : [],
          isSection:     indent > 0 && b.section === true,
          createdAt:     typeof b.createdAt === 'string' ? b.createdAt : null,
          isHidden:      Boolean(b.isHidden ?? false),
          archived:      Boolean(b.archived ?? false),
          onHold:        Boolean(b.onHold ?? false),
          flag:          typeof b.flag === 'string' ? b.flag : null,
          listStatus:    indent === 0 ? (parseListStatus(b.listStatus) ?? null) : null,
          note:          indent > 0 && typeof b.note === 'string' && b.note.trim() !== '' ? b.note : null,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    // Full replace in one batch transaction (2 queries total). The previous
    // version updated each block individually inside an interactive
    // transaction — with a remote DB (~46ms/query) large imports blew past
    // Prisma's 5s transaction timeout (P2028) and the request 500'd.
    await prisma.$transaction([
      prisma.block.deleteMany({ where: { projectId: project.id } }),
      ...(toCreate.length
        ? [prisma.block.createMany({ data: toCreate, skipDuplicates: true })]
        : []),
    ]);
  }

  // Mirror the payload: drop projects the client no longer has (e.g. after an
  // override import or a project deletion). Blocks cascade via the FK.
  const incomingProjectLocalIds = projects
    .map(p => (typeof p.project_id === 'string' ? p.project_id : ''))
    .filter(Boolean);
  if (incomingProjectLocalIds.length > 0) {
    await prisma.project.deleteMany({
      where: { userId: user.id, localId: { notIn: incomingProjectLocalIds } },
    });
  }

  // TaskCompletion: a task that sends doneDates is synced to exactly that set; one
  // that doesn't (e.g. a tab still on older code) keeps its rows; a deleted task
  // drops them. Only the difference is written.
  if (projects.length > 0) {
    const existing = await prisma.taskCompletion.findMany({
      where: { userId: user.id },
      select: { id: true, taskLocalId: true, date: true },
    });
    const staleIds = existing
      .filter(c => !seenTaskIds.has(c.taskLocalId) || (incomingDone.get(c.taskLocalId)?.has(c.date) === false))
      .map(c => c.id);
    const existingKeys = new Set(existing.map(c => `${c.taskLocalId}|${c.date}`));
    const toAdd = [...incomingDone].flatMap(([taskLocalId, dates]) =>
      [...dates]
        .filter(date => !existingKeys.has(`${taskLocalId}|${date}`))
        .map(date => ({ userId: user.id, taskLocalId, date })),
    );
    if (staleIds.length || toAdd.length) {
      await prisma.$transaction([
        ...(staleIds.length ? [prisma.taskCompletion.deleteMany({ where: { id: { in: staleIds } } })] : []),
        ...(toAdd.length ? [prisma.taskCompletion.createMany({ data: toAdd, skipDuplicates: true })] : []),
      ]);
    }
  }

  // A post-hydration upload means the client already ran its one-time starter
  // group seeding (it seeds right after the first GET that says groupsSeeded=false)
  const markSeeded = hydrated && !user.groupsSeeded;
  if (typeof body.selectedProjectId === 'string' || markSeeded) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(typeof body.selectedProjectId === 'string' ? { selectedProjectLocalId: body.selectedProjectId } : {}),
        ...(markSeeded ? { groupsSeeded: true } : {}),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
