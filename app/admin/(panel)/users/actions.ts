'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { isAdmin } from '@/lib/adminAuth';
import { DUMMY_USERS } from '@/lib/adminDummyUsers';
import { isPlan } from '@/lib/subscription';

const MONTH = 30 * 24 * 60 * 60 * 1000;

export async function setUserPlan(userId: string, plan: string) {
  if (!(await isAdmin())) throw new Error('Unauthorized');
  if (!isPlan(plan)) throw new Error('Invalid plan');

  // Switching to "paid" when nothing is covered grants one month from today.
  const freshPaidUntil = (current: Date | null) =>
    plan === 'paid' ? (current && current.getTime() > Date.now() ? current : new Date(Date.now() + MONTH)) : null;

  if (process.env.DATABASE_URL) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { paidUntil: true } });
    if (!user) throw new Error('User not found');
    await prisma.user.update({ where: { id: userId }, data: { plan, paidUntil: freshPaidUntil(user.paidUntil) } });
  } else {
    const user = DUMMY_USERS.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    user.plan = plan;
    user.paidUntil = freshPaidUntil(user.paidUntil);
  }

  revalidatePath('/admin/users');
  revalidatePath('/admin/payments');
}
