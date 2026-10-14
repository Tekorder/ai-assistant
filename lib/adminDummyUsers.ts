import 'server-only';
import type { Plan } from '@/lib/subscription';

// Fake users and payments for the admin panel when DATABASE_URL is not set (local dev).
// Module state, so plan changes stick until the dev server restarts.
const FIRST = ['Ana', 'Carlos', 'Lucía', 'Mateo', 'Sofía', 'Diego', 'Valentina', 'Andrés', 'Camila', 'Javier', 'Isabella', 'Martín', 'Paula', 'Tomás', 'Elena', 'Gabriel'];
const LAST = ['García', 'Rodríguez', 'López', 'Martínez', 'Pérez', 'Gómez', 'Sánchez', 'Díaz'];
const ZONES = ['America/Mexico_City', 'America/Bogota', 'America/Lima', 'Europe/Madrid', 'America/New_York'];
const DAY = 24 * 60 * 60 * 1000;
export const MONTHLY_PRICE = 999;
export const PERPETUAL_PRICE = 14900;

function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function planFor(i: number): Plan {
  if (i % 6 === 0) return 'perpetual';
  if (i % 5 === 4) return 'free';
  return 'paid';
}

export const DUMMY_USERS = Array.from({ length: 64 }, (_, i) => {
  const first = FIRST[i % FIRST.length];
  const last = LAST[(i * 3) % LAST.length];
  const username = `${slug(first)}${slug(last)}${i}`;
  const plan = planFor(i);
  // Roughly 1 in 4 paid users let their subscription lapse
  const paidUntil = plan === 'paid' ? new Date(Date.now() + (i % 4 === 1 ? -(i % 20 + 3) : (i % 27) + 2) * DAY) : null;
  return {
    id: `dummy-${i + 1}`,
    email: `${slug(first)}.${slug(last)}${i}@example.com`,
    name: i % 9 === 4 ? null : `${first} ${last}`,
    username: i % 5 === 2 ? null : username,
    avatarUrl: null as string | null,
    firebaseUid: i % 7 === 3 ? null : i % 3 === 0 ? `tekorder:${i}` : `fb_${username}`,
    onboarded: i % 4 !== 1,
    timezone: ZONES[i % ZONES.length],
    plan: plan as Plan,
    paidUntil,
    rowCreatedAt: new Date(Date.now() - (i * 1.7 + 0.3) * DAY),
    _count: { projects: (i * 7) % 12, habits: (i * 5) % 9, reminders: (i * 11) % 20, checklists: (i * 3) % 6 },
  };
});

// Monthly charges for paid users (up to their paidUntil), one-off charge for perpetual ones.
export const DUMMY_PAYMENTS = DUMMY_USERS.flatMap((u, i) => {
  const user = { name: u.name, email: u.email };
  if (u.plan === 'perpetual') {
    return [{ id: `pay-${u.id}`, userId: u.id, amount: PERPETUAL_PRICE, currency: 'USD', paidAt: new Date(Date.now() - ((i * 13) % 170) * DAY), user }];
  }
  if (u.plan !== 'paid' || !u.paidUntil) return [];
  const months = (i % 6) + 1;
  return Array.from({ length: months }, (_, m) => ({
    id: `pay-${u.id}-${m}`,
    userId: u.id,
    amount: MONTHLY_PRICE,
    currency: 'USD',
    paidAt: new Date(u.paidUntil!.getTime() - (m + 1) * 30 * DAY),
    user,
  })).filter(p => p.paidAt.getTime() <= Date.now());
}).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
