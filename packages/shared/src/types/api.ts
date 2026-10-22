/** Every API response uses one of these two envelopes. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export interface ApiFailure {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: { path: string; message: string }[];
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'BUSINESS_RULE'
  | 'CSRF'
  | 'INTERNAL';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export interface CompanySummary {
  id: string;
  name: string;
  roleName: string;
}

export interface AuthContext {
  user: AuthUser;
  companies: CompanySummary[];
  activeCompany: (CompanySummary & { permissions: string[]; projectAccess: { mode: 'all' | 'restricted'; projectIds: string[] } }) | null;
}

export interface LoginResult extends AuthContext {
  accessToken: string;
  accessTokenExpiresAt: string;
}
