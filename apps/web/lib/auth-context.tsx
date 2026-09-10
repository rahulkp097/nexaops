'use client';

import type { MeResponseDto } from '@nexaops/shared-types';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as authApi from './api/auth';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './token-storage';

interface AuthContextValue {
  user: MeResponseDto | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (organizationName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromAuthResponse(user: { id: string; email: string; role: MeResponseDto['role']; organizationId: string }): MeResponseDto {
  return { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MeResponseDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.getMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    setTokens(result.accessToken, result.refreshToken);
    setUser(userFromAuthResponse(result.user));
  }, []);

  const register = useCallback(async (organizationName: string, email: string, password: string) => {
    const result = await authApi.register({ organizationName, email, password });
    setTokens(result.accessToken, result.refreshToken);
    setUser(userFromAuthResponse(result.user));
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Logout is idempotent server-side and this is best-effort client
        // cleanup either way — a failed request shouldn't block signing out.
      }
    }
    clearTokens();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
