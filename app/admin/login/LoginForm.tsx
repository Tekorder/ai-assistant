'use client';

import { useActionState } from 'react';
import { adminLogin } from '../actions';

export default function LoginForm() {
  const [error, action, pending] = useActionState(adminLogin, null);

  return (
    <form action={action} className="mt-8 space-y-3">
      <input
        type="password"
        name="password"
        placeholder="Password"
        autoFocus
        required
        className="w-full border border-black bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:ring-1 focus:ring-black"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-black py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {error && <p className="text-sm text-black">{error}</p>}
    </form>
  );
}
