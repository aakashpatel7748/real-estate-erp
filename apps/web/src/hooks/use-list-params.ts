import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Table state (page, page size, sort, search and filters) kept in the URL so lists are
 * shareable, bookmarkable and survive reloads.
 */
export function useListParams(defaults: { pageSize?: number; sort?: string } = {}) {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const pageSize = Number(params.get('pageSize') ?? defaults.pageSize ?? 20) || 20;
  const sort = params.get('sort') ?? defaults.sort;
  const q = params.get('q') ?? '';

  const update = React.useCallback(
    (patch: Record<string, string | number | undefined | null>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === null || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const filter = (key: string) => params.get(key) ?? undefined;

  return {
    page,
    pageSize,
    sort,
    q,
    filter,
    setPage: (p: number) => update({ page: p }, false),
    setPageSize: (s: number) => update({ pageSize: s }),
    setSort: (s: string | undefined) => update({ sort: s }),
    setQ: (value: string) => update({ q: value }),
    setFilter: (key: string, value: string | undefined) => update({ [key]: value }),
    query: { page, pageSize, sort, q: q || undefined },
  };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}
