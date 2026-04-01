'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    try {
      const prismaUserId = localStorage.getItem('prisma_user_id');
      router.replace(prismaUserId ? '/assistant' : '/login');
    } catch {
      router.replace('/login');
    }
  }, [router]);

  // Evita “flash” de UI antes del redirect.
  return null;
}
