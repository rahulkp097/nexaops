'use client';

import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui';
import { useAuth } from '../../../lib/auth-context';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Settings</h1>

      <div className="max-w-md space-y-3 rounded-md border border-neutral-200 p-4 text-sm">
        <div>
          <span className="block text-xs uppercase text-neutral-500">Email</span>
          <span>{user.email}</span>
        </div>
        <div>
          <span className="block text-xs uppercase text-neutral-500">Role</span>
          <span>{user.role}</span>
        </div>
        <div>
          <span className="block text-xs uppercase text-neutral-500">Organization ID</span>
          <span className="break-all">{user.organizationId}</span>
        </div>
      </div>

      <div className="mt-6">
        <Button
          variant="danger"
          onClick={async () => {
            await logout();
            router.push('/login');
          }}
        >
          Log out
        </Button>
      </div>
    </div>
  );
}
