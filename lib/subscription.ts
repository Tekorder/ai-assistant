export const PLANS = ['free', 'paid', 'perpetual'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABEL: Record<Plan, string> = { free: 'Free', paid: 'Paid', perpetual: 'Perpetual' };

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS as readonly string[]).includes(v);
}

// active: perpetual, or paid with paidUntil in the future
// unpaid: paid plan whose paidUntil has passed (no longer a user for lack of payment)
export type SubscriptionStatus = 'active' | 'unpaid' | 'free';

export function subscriptionStatus(plan: string, paidUntil: Date | null, now = Date.now()): SubscriptionStatus {
  if (plan === 'perpetual') return 'active';
  if (plan === 'paid') return paidUntil && paidUntil.getTime() > now ? 'active' : 'unpaid';
  return 'free';
}

export function formatMoney(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
