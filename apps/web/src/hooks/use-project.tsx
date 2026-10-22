import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/auth-context';

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface ProjectCtx {
  projects: ProjectSummary[];
  loading: boolean;
  /** Currently selected project filter; null = all accessible projects. */
  projectId: string | null;
  project: ProjectSummary | null;
  setProjectId: (id: string | null) => void;
}

const Ctx = React.createContext<ProjectCtx | null>(null);
const KEY = 'erp.projectId';

function safeGet(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { context, can } = useAuth();
  const companyId = context?.activeCompany?.id;
  const [projectId, setState] = React.useState<string | null>(safeGet);
  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'selector', companyId],
    queryFn: () => api.page<ProjectSummary>('/projects', { pageSize: 100, sort: 'name' }),
    enabled: Boolean(companyId) && can('projects.read'),
    staleTime: 60_000,
  });
  const projects = React.useMemo(() => data?.items ?? [], [data]);

  // Drop a stale selection (e.g. project archived or access revoked).
  React.useEffect(() => {
    if (projectId && data && !projects.some((p) => p.id === projectId)) setState(null);
  }, [projectId, projects, data]);

  const setProjectId = React.useCallback((id: string | null) => {
    setState(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = React.useMemo(
    () => ({ projects, loading: isLoading, projectId, project: projects.find((p) => p.id === projectId) ?? null, setProjectId }),
    [projects, isLoading, projectId, setProjectId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjectContext() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useProjectContext must be used inside ProjectProvider');
  return ctx;
}
