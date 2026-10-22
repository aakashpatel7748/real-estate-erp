import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@erp/shared';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Select, Skeleton } from './ui/primitives';
import { EmptyState, ErrorState } from './states';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Server-side sort field; omit for unsortable columns. */
  sortKey?: string;
  className?: string;
  align?: 'left' | 'right' | 'center';
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  meta?: PageMeta;
  page?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  sort?: string;
  onSortChange?: (sort: string | undefined) => void;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
}

/** Table with server-side pagination & sorting, loading skeletons, empty and error states. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  meta,
  onPageChange,
  pageSize,
  onPageSizeChange,
  sort,
  onSortChange,
  onRowClick,
  empty,
  className,
}: DataTableProps<T>) {
  const sortField = sort?.replace(/^-/, '');
  const desc = sort?.startsWith('-');

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    if (sortField !== key) onSortChange(key);
    else if (!desc) onSortChange(`-${key}`);
    else onSortChange(undefined);
  };

  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  return (
    <div className={cn('rounded-xl border bg-card', className)}>
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.sortKey && sortField === c.sortKey ? (desc ? 'descending' : 'ascending') : undefined}
                  className={cn(
                    'h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.hideOnMobile && 'hidden md:table-cell',
                    c.className,
                  )}
                >
                  {c.sortKey && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.sortKey!)}
                      className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      {c.header}
                      {sortField === c.sortKey ? (
                        desc ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUp className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !rows
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-3', c.hideOnMobile && 'hidden md:table-cell')}>
                        <Skeleton className="h-4 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(
                      'border-b last:border-0 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50',
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'px-3 py-2.5 align-middle',
                          c.align === 'right' && 'text-right tabular',
                          c.align === 'center' && 'text-center',
                          c.hideOnMobile && 'hidden md:table-cell',
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows && rows.length === 0 && <div className="border-t">{empty ?? <EmptyState title="Nothing here yet" />}</div>}
      {meta && onPageChange && (meta.total > 0 || meta.page > 1) && (
        <div className="flex flex-col items-center justify-between gap-3 border-t px-3 py-2.5 text-sm text-muted-foreground sm:flex-row">
          <span className="tabular">
            {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
          </span>
          <div className="flex items-center gap-2">
            {onPageSizeChange && (
              <label className="flex items-center gap-2">
                <span className="hidden sm:inline">Rows</span>
                <Select
                  className="h-8 w-20"
                  value={pageSize ?? meta.pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  aria-label="Rows per page"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <Button
              variant="outline"
              size="icon-sm"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <span className="tabular">
              {meta.page} / {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
