'use server';

import { redirect } from 'next/navigation';
import { endAdminSession, startAdminSession } from '@/lib/adminAuth';

export async function adminLogin(_prev: string | null, formData: FormData) {
  const password = String(formData.get('password') ?? '');
  // Small fixed delay to slow down guessing
  await new Promise(r => setTimeout(r, 400));
  if (!(await startAdminSession(password))) return 'Wrong password';
  redirect('/admin/users');
}

export async function adminLogout() {
  await endAdminSession();
  redirect('/admin/login');
}
