/**
 * Date conventions:
 * - Timestamps (createdAt, receivedAt) are stored as UTC instants and shown in Asia/Kolkata.
 * - Calendar dates (due dates, booking dates, voucher dates) are "date-only": stored as
 *   a Date at 00:00:00Z of that calendar day and exchanged as "YYYY-MM-DD" strings.
 *   They must be formatted with timeZone 'UTC' so they never shift by a day.
 */
export const APP_TIME_ZONE = 'Asia/Kolkata';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function parseISODate(value: string): Date {
  if (!isISODate(value)) throw new RangeError(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in India, as YYYY-MM-DD. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Add calendar months, clamping to the last day of the target month (31 Jan + 1m = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toISODate(d);
}

/** Indian financial year label for a date-only value, e.g. 2026-10-22 -> "2026-27". */
export function financialYear(iso: string): string {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  const tz = typeof value === 'string' && value.length === 10 ? 'UTC' : APP_TIME_ZONE;
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);
}
