import type * as React from 'react';
import { AlertTriangle, Inbox, Lock, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, errorMessage } from '@/lib/api';
import { Button } from './ui/button';
import { Skeleton } from './ui/primitives';

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 rounded-full bg-muted p-3">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 403) return <PermissionDenied message={error.message} />;
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="mb-1 rounded-full bg-red-50 p-3 dark:bg-red-950/40">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <p className="font-medium">{notFound ? 'Not found' : 'Could not load this'}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {notFound ? 'It may have been removed, or you may not have access.' : errorMessage(error)}
      </p>
      {error instanceof ApiError && error.requestId && <p className="text-xs text-muted-foreground">Reference: {error.requestId}</p>}
      {onRetry && !notFound && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function PermissionDenied({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="mb-1 rounded-full bg-amber-50 p-3 dark:bg-amber-950/40">
        <Lock className="size-6 text-amber-600" />
      </div>
      <p className="font-medium">You don’t have access to this</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {message ?? 'Ask a company administrator to update your role if you need it.'}
      </p>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
