'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasSession } from '@/lib/session';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(hasSession() ? '/assistant' : '/login');
  }, [router]);

  // Evita “flash” de UI antes del redirect.
  return null;
}
