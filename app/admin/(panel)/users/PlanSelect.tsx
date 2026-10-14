'use client';

import { useTransition } from 'react';
import { PLANS, PLAN_LABEL } from '@/lib/subscription';
import { setUserPlan } from './actions';

export default function PlanSelect({ userId, plan }: { userId: string; plan: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Subscription plan"
      defaultValue={plan}
      disabled={pending}
      onChange={e => {
        const next = e.target.value;
        startTransition(() => setUserPlan(userId, next));
      }}
      className="border border-black bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-black disabled:opacity-50"
    >
      {PLANS.map(p => (
        <option key={p} value={p}>
          {PLAN_LABEL[p]}
        </option>
      ))}
    </select>
  );
}
