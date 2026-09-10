'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { Spinner } from './ui';

// The nav already hides admin-only links from non-admins, but a
// direct/bookmarked URL still needs its own check — this is that check,
// used by every ADMIN-only page (documents, admin/users, evaluation,
// observability).
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.replace('/chat');
    }
  }, [user, router]);

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return <>{children}</>;
}
