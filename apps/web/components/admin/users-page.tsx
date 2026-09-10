'use client';

import type { AdminUserResponseDto, Role, UserStatus } from '@nexaops/shared-types';
import { useEffect, useState } from 'react';
import { listUsers, updateUser } from '../../lib/api/admin';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { Badge, ErrorBanner, Spinner } from '../ui';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
const STATUSES: UserStatus[] = ['ACTIVE', 'DISABLED'];

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUserResponseDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load users'));
  }, []);

  async function handleChange(id: string, patch: { role?: Role; status?: UserStatus }) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await updateUser(id, patch);
      setUsers((prev) => prev?.map((u) => (u.id === id ? updated : u)) ?? prev);
    } catch (err) {
      // Most likely spec's "can't remove an org's last active admin" guard.
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Users</h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {users === null && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}

      {users && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-neutral-500">
            <tr>
              <th className="pb-2">Email</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              const disabled = busyId === u.id;
              return (
                <tr key={u.id} className="border-t border-neutral-100">
                  <td className="py-2">
                    {u.email} {isSelf && <Badge>you</Badge>}
                  </td>
                  <td className="py-2">
                    <select
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      value={u.role}
                      disabled={disabled}
                      onChange={(e) => handleChange(u.id, { role: e.target.value as Role })}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <select
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      value={u.status}
                      disabled={disabled}
                      onChange={(e) => handleChange(u.id, { status: e.target.value as UserStatus })}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-neutral-500">{new Date(u.updatedAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
