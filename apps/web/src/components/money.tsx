import * as React from 'react';
import { z } from 'zod';
import { rupeesToPaise, sqftToAreaX100 } from '@erp/shared';
import { Input } from './ui/primitives';
import { cn } from '@/lib/utils';

/** Text input for rupee amounts. Values stay strings in forms and convert to paise on submit. */
export const MoneyInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
      <Input ref={ref} inputMode="decimal" autoComplete="off" className={cn('pl-7 tabular', className)} {...props} />
    </div>
  ),
);
MoneyInput.displayName = 'MoneyInput';

/** Zod helpers for string form fields that become integers on submit. */
export const rupeeField = (label: string, { required = true, min = 0 } = {}) =>
  z
    .string()
    .trim()
    .refine(
      (v) => (!required && v === '') || /^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, '')),
      `${label}: enter an amount like 125000 or 1250.50`,
    )
    .refine((v) => v === '' || rupeesToPaise(v) >= min, `${label} must be at least ${min / 100}`);

export const areaField = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, `${label}: enter square feet, up to 2 decimals`);

export const percentField = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 100), `${label}: 0–100 with up to 2 decimals`);

export const toPaise = (v: string) => (v.trim() === '' ? 0 : rupeesToPaise(v));
export const toAreaX100 = (v: string) => sqftToAreaX100(v);
/** "12.5" (%) -> 1250 bp, without floating point. */
export const toBp = (v: string) => (v.trim() === '' ? 0 : rupeesToPaise(v));
export const paiseToInput = (p: number | undefined | null) =>
  p === undefined || p === null ? '' : (p / 100).toFixed(2).replace(/\.00$/, '');
export const bpToInput = (bp: number | undefined | null) => (bp ? (bp / 100).toString() : '');
