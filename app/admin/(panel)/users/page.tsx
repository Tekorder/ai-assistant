import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { DUMMY_USERS } from '@/lib/adminDummyUsers';
import { subscriptionStatus } from '@/lib/subscription';
import PlanSelect from './PlanSelect';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const DAY = 24 * 60 * 60 * 1000;

const dateFmt = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

function provider(firebaseUid: string | null) {
  if (!firebaseUid) return '—';
  return firebaseUid.startsWith('tekorder:') ? 'TekOrder' : 'Firebase';
}

function StatusBadge({ plan, paidUntil }: { plan: string; paidUntil: Date | null }) {
  const status = subscriptionStatus(plan, paidUntil);
  if (status === 'active') {
    return (
      <span className="bg-black px-2 py-0.5 text-xs text-white" data-tip={paidUntil ? `Paid until ${dateFmt.format(paidUntil)}` : undefined}>
        Active
      </span>
    );
  }
  if (status === 'unpaid') {
    return (
      <span
        className="border border-red-600 px-2 py-0.5 text-xs text-red-700"
        data-tip={paidUntil ? `Expired ${dateFmt.format(paidUntil)}` : 'No payment on record'}
      >
        Inactive · unpaid
      </span>
    );
  }
  return <span className="border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">Free</span>;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();

  const { q: rawQ, page: rawPage } = await searchParams;
  const q = (rawQ ?? '').trim();
  const page = Math.max(1, Number(rawPage) || 1);

  const { total, active, unpaid, newThisWeek, matching, users } = process.env.DATABASE_URL
    ? await loadUsers(q, page)
    : dummyUsers(q, page);

  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const pageHref = (p: number) => `/admin/users?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`;

  return (
    <div className="max-w-6xl">
      <h1 className="text-3xl font-bold tracking-tight">Users</h1>

      <dl className="mt-6 grid grid-cols-2 border-l border-t border-black md:grid-cols-4">
        {[
          ['Total', total],
          ['Active', active],
          ['Unpaid', unpaid],
          ['New (7 days)', newThisWeek],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-r border-black px-4 py-4">
            <dt className="text-xs uppercase tracking-wider text-neutral-500">{label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <form className="mt-8 flex gap-2" action="/admin/users">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by email, name or username"
          className="w-full max-w-sm border border-black bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:ring-1 focus:ring-black"
        />
        <button type="submit" className="bg-black px-4 text-sm font-semibold text-white hover:opacity-85">
          Search
        </button>
        {q && (
          <Link href="/admin/users" className="self-center text-sm text-neutral-500 hover:text-black">
            Clear
          </Link>
        )}
      </form>

      <p className="mt-4 text-xs text-neutral-500">
        {matching} {matching === 1 ? 'result' : 'results'}
      </p>

      <div className="mt-2 overflow-x-auto border-t border-black">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-black text-xs uppercase tracking-wider text-neutral-500">
              <th className="py-3 pr-4 font-medium">User</th>
              <th className="py-3 pr-4 font-medium">Username</th>
              <th className="py-3 pr-4 font-medium">Login</th>
              <th className="py-3 pr-4 font-medium">Plan</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 text-right font-medium" data-tip="Projects · Habits · Reminders · Checklists">
                P · H · R · C
              </th>
              <th className="py-3 text-right font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover grayscale" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black text-xs font-semibold">
                        {(u.name || u.email).charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {u.name || '—'}
                        {!u.onboarded && <span className="ml-2 text-xs font-normal text-neutral-400">setup pending</span>}
                      </p>
                      <p className="break-all text-xs text-neutral-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4 text-neutral-700">{u.username ? `@${u.username}` : '—'}</td>
                <td className="py-3 pr-4 text-neutral-700">{provider(u.firebaseUid)}</td>
                <td className="py-3 pr-4">
                  <PlanSelect key={u.plan} userId={u.id} plan={u.plan} />
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge plan={u.plan} paidUntil={u.paidUntil} />
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-neutral-700">
                  {u._count.projects} · {u._count.habits} · {u._count.reminders} · {u._count.checklists}
                </td>
                <td className="py-3 text-right text-neutral-700" data-tip={u.timezone}>
                  {dateFmt.format(u.rowCreatedAt)}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-neutral-500">
                  No users{q && ' match this search'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="hover:underline">← Previous</Link>
          ) : <span />}
          <span className="text-neutral-500">Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="hover:underline">Next →</Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}

async function loadUsers(q: string, page: number) {
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

  const now = new Date();
  const [total, active, unpaid, newThisWeek, matching, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { OR: [{ plan: 'perpetual' }, { plan: 'paid', paidUntil: { gt: now } }] } }),
    prisma.user.count({ where: { plan: 'paid', OR: [{ paidUntil: null }, { paidUntil: { lte: now } }] } }),
    prisma.user.count({ where: { rowCreatedAt: { gte: new Date(Date.now() - 7 * DAY) } } }),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { rowCreatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        avatarUrl: true,
        firebaseUid: true,
        onboarded: true,
        timezone: true,
        plan: true,
        paidUntil: true,
        rowCreatedAt: true,
        _count: { select: { projects: true, habits: true, reminders: true, checklists: true } },
      },
    }),
  ]);
  return { total, active, unpaid, newThisWeek, matching, users };
}

// No DATABASE_URL (local dev): same shape, served from fake data.
function dummyUsers(q: string, page: number) {
  const needle = q.toLowerCase();
  const filtered = needle
    ? DUMMY_USERS.filter(u => [u.email, u.name, u.username].some(f => f?.toLowerCase().includes(needle)))
    : DUMMY_USERS;
  return {
    total: DUMMY_USERS.length,
    active: DUMMY_USERS.filter(u => subscriptionStatus(u.plan, u.paidUntil) === 'active').length,
    unpaid: DUMMY_USERS.filter(u => subscriptionStatus(u.plan, u.paidUntil) === 'unpaid').length,
    newThisWeek: DUMMY_USERS.filter(u => u.rowCreatedAt.getTime() >= Date.now() - 7 * DAY).length,
    matching: filtered.length,
    users: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}
