export { formatINR, formatINRCompact, formatDate, formatDateTime, areaToSqft } from '@erp/shared';

export function dateOnly(value: string | Date | undefined | null): string {
  if (!value) return '';
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
