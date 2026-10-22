import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthContext, LoginResult, Permission } from '@erp/shared';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '@/lib/api';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  context: AuthContext | null;
  /** Usability only. The API re-checks every permission on every request. */
  can: (permission: Permission) => boolean;
  canAccessProject: (projectId: string) => boolean;
  applyLogin: (result: LoginResult) => void;
  logout: () => Promise<void>;
  selectCompany: (companyId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = React.createContext<AuthState | null>(null);

function readCookie(name: string) {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<Status>('loading');
  const [context, setContext] = React.useState<AuthContext | null>(null);

  const applyLogin = React.useCallback((result: LoginResult) => {
    setAccessToken(result.accessToken);
    const { accessToken: _a, accessTokenExpiresAt: _b, ...ctx } = result;
    setContext(ctx);
    setStatus('authenticated');
  }, []);

  const clear = React.useCallback(() => {
    setAccessToken(null);
    setContext(null);
    setStatus('anonymous');
    qc.clear();
  }, [qc]);

  // Restore the session on load using the HttpOnly refresh cookie.
  React.useEffect(() => {
    setSessionExpiredHandler(clear);
    refreshSession().then((r) => (r ? applyLogin(r) : setStatus('anonymous')));
  }, [applyLogin, clear]);

  // Proactively refresh shortly before the access token expires.
  React.useEffect(() => {
    if (status !== 'authenticated') return;
    const id = window.setInterval(() => void refreshSession().then((r) => r && applyLogin(r)), 12 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [status, applyLogin]);

  const value = React.useMemo<AuthState>(() => {
    const perms = new Set(context?.activeCompany?.permissions ?? []);
    const access = context?.activeCompany?.projectAccess;
    return {
      status,
      context,
      can: (p) => perms.has(p),
      canAccessProject: (id) => !access || access.mode === 'all' || access.projectIds.includes(id),
      applyLogin,
      logout: async () => {
        await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'x-csrf-token': readCookie('erp_csrf') ?? '' },
        }).catch(() => undefined);
        clear();
      },
      selectCompany: async (companyId) => {
        const ctx = await api.post<AuthContext>('/auth/select-company', { companyId });
        qc.clear();
        localStorage.removeItem('erp.projectId');
        setContext(ctx);
      },
      reload: async () => setContext(await api.get<AuthContext>('/auth/me')),
    };
  }, [status, context, applyLogin, clear, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Renders children only when the user holds the permission (UI convenience, not security). */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return useAuth().can(permission) ? <>{children}</> : <>{fallback}</>;
}
