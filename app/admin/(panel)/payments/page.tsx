import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { DUMMY_PAYMENTS, DUMMY_USERS } from '@/lib/adminDummyUsers';
import { formatMoney, subscriptionStatus } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

const MONTHS = 6;
const RECENT = 20;

const dateFmt = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });
const monthLongFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

type RecentPayment = {
  id: string;
  amount: number;
  currency: string;
  paidAt: Date;
  user: { name: string | null; email: string };
};

type PaymentsData = {
  allTime: number;
  chartPayments: { amount: number; paidAt: Date }[];
  recent: RecentPayment[];
  active: number;
  perpetual: number;
  unpaid: number;
};

export default async function AdminPaymentsPage() {
  await requireAdmin();

  const since = monthStart(MONTHS - 1);
  const { allTime, chartPayments, recent, active, perpetual, unpaid } = process.env.DATABASE_URL
    ? await loadPayments(since)
    : dummyPayments(since);

  // Revenue per calendar month, oldest first
  const months = Array.from({ length: MONTHS }, (_, i) => {
    const start = monthStart(MONTHS - 1 - i);
    const end = monthStart(MONTHS - 2 - i);
    const inMonth = chartPayments.filter(p => p.paidAt >= start && p.paidAt < end);
    return { start, total: inMonth.reduce((s, p) => s + p.amount, 0), count: inMonth.length };
  });
  const thisMonth = months[months.length - 1];
  const lastMonth = months[months.length - 2];
  const max = Math.max(1, ...months.map(m => m.total));
  const change = lastMonth.total ? Math.round(((thisMonth.total - lastMonth.total) / lastMonth.total) * 100) : null;

  return (
    <div className="max-w-6xl">
      <h1 className="text-3xl font-bold tracking-tight">Payments</h1>

      <dl className="mt-6 grid grid-cols-2 border-l border-t border-black md:grid-cols-4">
        <Stat label="This month" value={formatMoney(thisMonth.total)}>
          {change !== null && (
            <span className="text-xs text-neutral-500">
              {change >= 0 ? '▲' : '▼'} {Math.abs(change)}% vs last month
            </span>
          )}
        </Stat>
        <Stat label="All time" value={formatMoney(allTime)} />
        <Stat label="Active subscribers" value={String(active)}>
          <span className="text-xs text-neutral-500">{perpetual} perpetual</span>
        </Stat>
        <Stat label="Unpaid" value={String(unpaid)}>
          <span className="text-xs text-neutral-500">lost for lack of payment</span>
        </Stat>
      </dl>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Revenue, last {MONTHS} months</h2>
        <div className="mt-4 flex h-48 items-end gap-2 border-b border-black md:gap-4" role="img" aria-label="Revenue per month">
          {months.map((m, i) => {
            const isCurrent = i === months.length - 1;
            return (
              <div
                key={m.start.toISOString()}
                className="group relative flex h-full flex-1 flex-col justify-end"
                title={`${monthLongFmt.format(m.start)}: ${formatMoney(m.total)} · ${m.count} payments`}
              >
                <span
                  className={`mb-1 text-center text-xs tabular-nums text-neutral-700 ${
                    isCurrent ? '' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {formatMoney(m.total)}
                </span>
                <div
                  className={`mx-auto w-full max-w-16 rounded-t ${isCurrent ? 'bg-black' : 'bg-neutral-400 group-hover:bg-neutral-600'}`}
                  style={{ height: `${(m.total / max) * 80}%`, minHeight: m.total ? 2 : 0 }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2 md:gap-4">
          {months.map(m => (
            <span key={m.start.toISOString()} className="flex-1 text-center text-xs text-neutral-500">
              {monthFmt.format(m.start)}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Recent payments</h2>
        <div className="mt-2 overflow-x-auto border-t border-black">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-black text-xs uppercase tracking-wider text-neutral-500">
                <th className="py-3 pr-4 font-medium">Date</th>
                <th className="py-3 pr-4 font-medium">User</th>
                <th className="py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(p => (
                <tr key={p.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                  <td className="py-3 pr-4 text-neutral-700">{dateFmt.format(p.paidAt)}</td>
                  <td className="py-3 pr-4">
                    <p className="font-medium">{p.user.name || '—'}</p>
                    <p className="text-xs text-neutral-500">{p.user.email}</p>
                  </td>
                  <td className="py-3 text-right font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={3}className="py-10 text-center text-neutral-500">
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="border-b border-r border-black px-4 py-4">
      <dt className="text-xs uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
      {children && <dd className="mt-1">{children}</dd>}
    </div>
  );
}

// First day of the month, `monthsAgo` months back (negative = future)
function monthStart(monthsAgo: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - monthsAgo, 1);
}

async function loadPayments(since: Date): Promise<PaymentsData> {
  const now = new Date();
  const [sum, chartPayments, recent, active, perpetual, unpaid] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.payment.findMany({ where: { paidAt: { gte: since } }, select: { amount: true, paidAt: true } }),
    prisma.payment.findMany({
      orderBy: { paidAt: 'desc' },
      take: RECENT,
      select: { id: true, amount: true, currency: true, paidAt: true, user: { select: { name: true, email: true } } },
    }),
    prisma.user.count({ where: { OR: [{ plan: 'perpetual' }, { plan: 'paid', paidUntil: { gt: now } }] } }),
    prisma.user.count({ where: { plan: 'perpetual' } }),
    prisma.user.count({ where: { plan: 'paid', OR: [{ paidUntil: null }, { paidUntil: { lte: now } }] } }),
  ]);
  return { allTime: sum._sum.amount ?? 0, chartPayments, recent, active, perpetual, unpaid };
}

// No DATABASE_URL (local dev): same shape, served from fake data.
function dummyPayments(since: Date): PaymentsData {
  const statuses = DUMMY_USERS.map(u => subscriptionStatus(u.plan, u.paidUntil));
  return {
    allTime: DUMMY_PAYMENTS.reduce((s, p) => s + p.amount, 0),
    chartPayments: DUMMY_PAYMENTS.filter(p => p.paidAt >= since),
    recent: DUMMY_PAYMENTS.slice(0, RECENT),
    active: statuses.filter(s => s === 'active').length,
    perpetual: DUMMY_USERS.filter(u => u.plan === 'perpetual').length,
    unpaid: statuses.filter(s => s === 'unpaid').length,
  };
}
