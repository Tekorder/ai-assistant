import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin · Youtask',
  robots: { index: false, follow: false },
};

// Shared shell for /admin and /admin/login: always black on white,
// regardless of the OS dark-mode setting the rest of the app follows.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-black">{children}</div>;
}
