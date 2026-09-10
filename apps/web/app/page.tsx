'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '../components/ui';
import { useAuth } from '../lib/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/chat' : '/login');
  }, [loading, user, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Spinner />
    </main>
  );
}
