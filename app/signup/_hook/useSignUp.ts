import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerWithEmail } from '@/lib/auth';
import { updateProfile } from 'firebase/auth';

interface SignUpData {
  name: string;
  email: string;
  password: string;
}

interface UseSignUpReturn {
  isLoading: boolean;
  error: string | null;
  signUp: (data: SignUpData) => Promise<void>;
}

export function useSignUp(): UseSignUpReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const signUp = async (data: SignUpData): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const cleanEmail = data.email.trim().toLowerCase();
      const cleanName = data.name.trim();

      const cred = await registerWithEmail(cleanEmail, data.password);

      await updateProfile(cred.user, { displayName: cleanName });

      const res = await fetch('/api/auth/upsert-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          name: cleanName,
          firebaseUid: cred.user.uid,
          avatarUrl: cred.user.photoURL || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.user?.id) {
        throw new Error(json?.message || 'Failed to create user in database.');
      }

      router.replace('/login');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, error, signUp };
}
