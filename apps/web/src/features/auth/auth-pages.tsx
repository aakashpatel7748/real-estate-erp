import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  forgotPasswordSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  type LoginInput,
  type LoginResult,
  type RegisterInput,
} from '@erp/shared';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, Input } from '@/components/ui/primitives';
import { Field } from '@/components/common';
import { ErrorState } from '@/components/states';
import { useAuth } from './auth-context';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-semibold ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary" />
        <path d="M7 9h8v6H7zM17 9h8v6h-8zM7 17h8v6H7z" fill="#ecfdf5" />
        <path d="M17 17h8v6h-8z" fill="#f59e0b" />
      </svg>
      <span className="text-lg tracking-tight">Plotline</span>
    </div>
  );
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Logo className="text-white" />
        <div className="relative z-10 max-w-md space-y-4">
          <h2 className="text-3xl font-semibold leading-tight text-white">Every plot, payment and paper — in one place.</h2>
          <ul className="space-y-2 text-sm text-sidebar-muted">
            {[
              'Live colour-coded layout maps',
              'Bookings that can never double-sell a plot',
              'Installments, receipts and ledgers that always balance',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <svg className="absolute -bottom-10 -right-10 w-[420px] opacity-20" viewBox="0 0 200 200" aria-hidden>
          {Array.from({ length: 36 }).map((_, i) => (
            <rect
              key={i}
              x={(i % 6) * 32 + 4}
              y={Math.floor(i / 6) * 32 + 4}
              width="28"
              height="28"
              rx="3"
              fill={['#16a34a', '#2563eb', '#f59e0b', '#7c3aed'][i % 4]}
            />
          ))}
        </svg>
        <p className="relative z-10 text-xs text-sidebar-muted">© {new Date().getFullYear()} Plotline ERP</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

function useServerErrors<T extends Record<string, unknown>>(setError: (name: keyof T & string, e: { message: string }) => void) {
  return (err: unknown) => {
    const fields = fieldErrors(err);
    if (Object.keys(fields).length) for (const [k, m] of Object.entries(fields)) setError(k as keyof T & string, { message: m });
    else toast.error(errorMessage(err));
  };
}

export function LoginPage() {
  const { status, applyLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const onError = useServerErrors<LoginInput>(form.setError);
  const mutation = useMutation({
    mutationFn: (v: LoginInput) => api.post<LoginResult>('/auth/login', v),
    onSuccess: (r) => {
      applyLogin(r);
      navigate(r.activeCompany ? from : '/select-company', { replace: true });
    },
    onError,
  });
  if (status === 'authenticated') return <Navigate to={from} replace />;
  const e = form.formState.errors;
  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Sign in to manage your projects.">
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
        <Field label="Email" htmlFor="email" error={e.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={e.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Plotline?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create a company account
        </Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { applyLogin } = useAuth();
  const navigate = useNavigate();
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  const onError = useServerErrors<RegisterInput>(form.setError);
  const mutation = useMutation({
    mutationFn: (v: RegisterInput) => api.post<LoginResult>('/auth/register', v),
    onSuccess: (r) => {
      applyLogin(r);
      toast.success('Account created. Check your email to verify your address.');
      navigate('/', { replace: true });
    },
    onError,
  });
  const e = form.formState.errors;
  return (
    <AuthLayout title="Create your company" subtitle="You’ll be the owner. Invite your team afterwards.">
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
        <Field label="Your name" htmlFor="name" error={e.name?.message} required>
          <Input autoComplete="name" {...form.register('name')} />
        </Field>
        <Field label="Company name" htmlFor="companyName" error={e.companyName?.message} required>
          <Input autoComplete="organization" {...form.register('companyName')} />
        </Field>
        <Field label="Work email" htmlFor="email" error={e.email?.message} required>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={e.password?.message}
          hint="At least 10 characters with upper, lower case and a number"
          required
        >
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema) });
  const mutation = useMutation({
    mutationFn: (v: { email: string }) => api.post('/auth/forgot-password', v),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <AuthLayout title="Reset your password" subtitle="We’ll email you a link to choose a new password.">
      {mutation.isSuccess ? (
        <Card className="p-4 text-sm">
          If an account exists for that email, a reset link is on its way. The link is valid for one hour.
        </Card>
      ) : (
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Button type="submit" className="w-full" loading={mutation.isPending}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

const resetForm = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof resetForm>>({ resolver: zodResolver(resetForm) });
  const mutation = useMutation({
    mutationFn: (v: { password: string }) => api.post('/auth/reset-password', { token, password: v.password }),
    onSuccess: () => {
      toast.success('Password updated. Please sign in.');
      navigate('/login');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <AuthLayout title="Choose a new password">
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
        <Field label="New password" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" loading={mutation.isPending} disabled={!token}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const q = useQuery({
    queryKey: ['verify', token],
    queryFn: () => api.post('/auth/verify-email', { token }),
    retry: false,
    enabled: Boolean(token),
  });
  return (
    <AuthLayout title="Email verification">
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Verifying…</p>
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <Card className="flex items-center gap-3 p-4 text-sm">
          <CheckCircle2 className="size-5 text-green-600" /> Your email address is verified.
        </Card>
      )}
      <Button asChild className="mt-6 w-full">
        <Link to="/">Continue</Link>
      </Button>
    </AuthLayout>
  );
}

const acceptForm = z.object({ name: z.string().trim().min(1, 'Name is required').max(100), password: passwordSchema });

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, applyLogin, context, reload, selectCompany } = useAuth();
  const navigate = useNavigate();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get<{ email: string; companyName: string; userExists: boolean }>(`/auth/invitations/${token}`),
    retry: false,
    enabled: Boolean(token),
  });
  const form = useForm<z.infer<typeof acceptForm>>({ resolver: zodResolver(acceptForm) });
  const accept = useMutation({
    mutationFn: (v?: z.infer<typeof acceptForm>) =>
      api.post<LoginResult | { accepted: true; companyId: string }>('/auth/accept-invite', { token, ...v }),
    onSuccess: async (r) => {
      if ('accessToken' in r) applyLogin(r);
      else {
        await reload();
        await selectCompany(r.companyId);
      }
      toast.success('Welcome aboard!');
      navigate('/', { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (invite.isError) return <AuthLayout title="Invitation">{<ErrorState error={invite.error} />}</AuthLayout>;
  if (!invite.data)
    return (
      <AuthLayout title="Invitation">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AuthLayout>
    );

  const inv = invite.data;
  return (
    <AuthLayout title={`Join ${inv.companyName}`} subtitle={`Invitation for ${inv.email}`}>
      {inv.userExists ? (
        status === 'authenticated' && context?.user.email === inv.email ? (
          <Button className="w-full" loading={accept.isPending} onClick={() => accept.mutate(undefined)}>
            Accept invitation <ChevronRight />
          </Button>
        ) : (
          <div className="space-y-4 text-sm">
            <p>You already have an account. Sign in as {inv.email}, then open this link again.</p>
            <Button asChild className="w-full">
              <Link to="/login" state={{ from: `/accept-invite?token=${token}` }}>
                Sign in
              </Link>
            </Button>
          </div>
        )
      ) : (
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => accept.mutate(v))} noValidate>
          <Field label="Your name" htmlFor="name" error={form.formState.errors.name?.message}>
            <Input autoComplete="name" {...form.register('name')} />
          </Field>
          <Field label="Choose a password" htmlFor="password" error={form.formState.errors.password?.message}>
            <Input type="password" autoComplete="new-password" {...form.register('password')} />
          </Field>
          <Button type="submit" className="w-full" loading={accept.isPending}>
            Create account & join
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function SelectCompanyPage() {
  const { context, selectCompany, status } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = React.useState<string | null>(null);
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  const companies = context?.companies ?? [];
  return (
    <AuthLayout title="Choose a company" subtitle="You belong to more than one company.">
      {companies.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          You are not an active member of any company yet. Ask an administrator for an invitation.
        </Card>
      ) : (
        <ul className="space-y-2">
          {companies.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={pending !== null}
                onClick={async () => {
                  setPending(c.id);
                  try {
                    await selectCompany(c.id);
                    navigate('/', { replace: true });
                  } catch (e) {
                    toast.error(errorMessage(e));
                    setPending(null);
                  }
                }}
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-60 cursor-pointer"
              >
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Building2 className="size-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.roleName}</p>
                </div>
                {pending === c.id ? (
                  <span className="text-xs text-muted-foreground">Opening…</span>
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AuthLayout>
  );
}
