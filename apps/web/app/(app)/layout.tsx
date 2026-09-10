'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Nav } from '../../components/nav';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth-context';

// Every authenticated page lives under this route group and is guarded
// here, once — RBAC-gated nav links (Nav) still hide admin-only pages, but
// a role check for admin-only *pages* themselves happens per-page (each
// page knows its own required role) rather than duplicated in this shared
// guard.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner />
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Nav />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
