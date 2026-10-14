'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Add new admin sections here as they're built.
const SECTIONS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/payments', label: 'Payments' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 md:mt-10 md:flex-col md:gap-1">
      {SECTIONS.map(s => {
        const active = pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`text-sm md:-mx-2 md:px-2 md:py-1.5 ${
              active ? 'font-semibold text-black md:bg-black md:text-white' : 'text-neutral-500 hover:text-black'
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
