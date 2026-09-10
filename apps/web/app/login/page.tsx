'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, ErrorBanner } from '../../components/ui';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/chat');
    }
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(organizationName, email, password);
      }
      router.replace('/chat');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">NexaOps</h1>
        <p className="mb-6 text-sm text-neutral-500">AI Enterprise Operations Copilot</p>

        <div className="mb-4 flex rounded-md bg-neutral-100 p-1 text-sm">
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 ${mode === 'login' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 ${mode === 'register' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            onClick={() => setMode('register')}
          >
            Create organization
          </button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="organizationName">
                Organization name
              </label>
              <input
                id="organizationName"
                required
                maxLength={255}
                className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              maxLength={255}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={mode === 'register' ? 8 : undefined}
              maxLength={128}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <ErrorBanner message={error} />}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create organization'}
          </Button>
        </form>
      </div>
    </main>
  );
}
