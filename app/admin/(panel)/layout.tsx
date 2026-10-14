import { requireAdmin } from '@/lib/adminAuth';
import { adminLogout } from '../actions';
import AdminNav from './AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center justify-between border-b border-black px-4 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-5 md:py-6">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoblue.png" alt="Youtask" width={180} height={44} className="h-8 w-auto md:h-9" />
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-400">Admin</p>
        </div>
        <AdminNav />
        <form action={adminLogout} className="md:mt-auto">
          <button type="submit" className="text-sm text-neutral-500 underline-offset-4 hover:text-black hover:underline">
            Sign out
          </button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
    </div>
  );
}
