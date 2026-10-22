import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/features/auth/auth-context';
import { TooltipProvider } from '@/components/ui/primitives';
import { router } from '@/app/router';
import './index.css';

try {
  if (localStorage.getItem('erp.theme') === 'dark') document.documentElement.classList.add('dark');
} catch {
  /* storage unavailable */
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Never retry client errors (403/404/422); retry transient failures twice.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
  queryCache: new QueryCache(),
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" closeButton />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
