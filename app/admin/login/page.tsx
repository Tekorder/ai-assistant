import { redirect } from 'next/navigation';
import { isAdmin, isAdminConfigured } from '@/lib/adminAuth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect('/admin/users');

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-xs">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Youtask</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Admin</h1>
        {isAdminConfigured() ? (
          <LoginForm />
        ) : (
          <p className="mt-8 border border-black p-3 text-sm">
            Set <code className="font-mono">ADMIN_PASSWORD</code> (8+ characters) in the environment.
          </p>
        )}
      </div>
    </main>
  );
}
