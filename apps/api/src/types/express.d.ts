import type { TenantContext } from '../utils/tenant';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string; companyId?: string };
      ctx?: TenantContext;
      validated?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export {};
