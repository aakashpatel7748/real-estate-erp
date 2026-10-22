import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { PAYMENT_MODES, todayInIndia } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { formatINR, titleCase } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { Field } from '@/components/common';
import { MoneyInput, rupeeField, toPaise } from '@/components/money';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  systemKey?: string;
  isBank?: boolean;
  isActive: boolean;
}

export function useCashAccounts(enabled = true) {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<Account[]>('/accounting/accounts'),
    enabled,
    select: (rows) =>
      rows.filter(
        (a) => a.type === 'asset' && a.isActive && (a.systemKey === 'cash' || a.systemKey === 'bank' || a.isBank || !a.systemKey),
      ),
  });
}

const paymentForm = z.object({
  amount: rupeeField('Amount', { min: 1 }),
  mode: z.enum(PAYMENT_MODES),
  receivedOn: z.string().min(10, 'Date is required'),
  reference: z.string().max(100).optional(),
  bankName: z.string().max(100).optional(),
  depositAccountId: z.string().optional(),
  remarks: z.string().max(500).optional(),
});
type PaymentForm = z.infer<typeof paymentForm>;

/**
 * Records a receipt. The idempotency key is created once per dialog session, so a double
 * click or a network retry can never record the same receipt twice.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  booking,
  canSeeAccounts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: { id: string; bookingNumber: string; outstandingPaise: number };
  canSeeAccounts: boolean;
}) {
  const qc = useQueryClient();
  const keyRef = React.useRef(newIdempotencyKey());
  React.useEffect(() => {
    if (open) keyRef.current = newIdempotencyKey();
  }, [open]);
  const accounts = useCashAccounts(open && canSeeAccounts);
  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentForm),
    defaultValues: { amount: '', mode: 'upi', receivedOn: todayInIndia(), reference: '', bankName: '', depositAccountId: '', remarks: '' },
  });
  const save = useMutation({
    mutationFn: (v: PaymentForm) =>
      api.post<{ id: string; number: string; advancePaise: number }>(
        '/payments',
        {
          bookingId: booking.id,
          amountPaise: toPaise(v.amount),
          mode: v.mode,
          receivedOn: v.receivedOn,
          reference: v.reference || undefined,
          bankName: v.bankName || undefined,
          depositAccountId: v.depositAccountId || undefined,
          remarks: v.remarks || undefined,
        },
        keyRef.current,
      ),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['booking', booking.id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Receipt ${p.number} recorded${p.advancePaise ? ` (${formatINR(p.advancePaise)} held as advance)` : ''}`);
      form.reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  const mode = form.watch('mode');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record payment" description={`${booking.bookingNumber} · outstanding ${formatINR(booking.outstandingPaise)}`}>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
          <Field label="Amount" htmlFor="pay-amount" error={e.amount?.message} required>
            <MoneyInput autoFocus {...form.register('amount')} />
          </Field>
          <Field label="Received on" htmlFor="pay-date" error={e.receivedOn?.message} required>
            <Input type="date" max={todayInIndia()} {...form.register('receivedOn')} />
          </Field>
          <Field label="Mode" htmlFor="pay-mode">
            <Select {...form.register('mode')}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m.length <= 4 ? m.toUpperCase() : titleCase(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={mode === 'cheque' ? 'Cheque no.' : 'Reference / UTR'} htmlFor="pay-ref" error={e.reference?.message}>
            <Input {...form.register('reference')} />
          </Field>
          {mode !== 'cash' && (
            <Field label="Bank" htmlFor="pay-bank">
              <Input {...form.register('bankName')} />
            </Field>
          )}
          {canSeeAccounts && (
            <Field label="Deposit to" htmlFor="pay-acc" hint="Defaults to Cash or Bank by mode">
              <Select {...form.register('depositAccountId')}>
                <option value="">Default</option>
                {accounts.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Remarks" htmlFor="pay-remarks" className="sm:col-span-2">
            <Textarea rows={2} {...form.register('remarks')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => form.setValue('amount', (booking.outstandingPaise / 100).toFixed(2))}>
              Fill outstanding
            </Button>
            <Button type="submit" loading={save.isPending}>
              Record receipt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const refundForm = z.object({
  amount: rupeeField('Amount', { min: 1 }),
  mode: z.enum(PAYMENT_MODES),
  paidOn: z.string().min(10, 'Date is required'),
  reference: z.string().max(100).optional(),
  remarks: z.string().max(500).optional(),
});

export function RefundDialog({
  open,
  onOpenChange,
  booking,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: { id: string; bookingNumber: string; refundablePaise: number };
}) {
  const qc = useQueryClient();
  const keyRef = React.useRef(newIdempotencyKey());
  React.useEffect(() => {
    if (open) keyRef.current = newIdempotencyKey();
  }, [open]);
  const form = useForm<z.infer<typeof refundForm>>({
    resolver: zodResolver(refundForm),
    defaultValues: { amount: (booking.refundablePaise / 100).toFixed(2), mode: 'neft', paidOn: todayInIndia(), reference: '', remarks: '' },
  });
  const save = useMutation({
    mutationFn: (v: z.infer<typeof refundForm>) =>
      api.post<{ number: string }>(
        `/bookings/${booking.id}/refunds`,
        {
          amountPaise: toPaise(v.amount),
          mode: v.mode,
          paidOn: v.paidOn,
          reference: v.reference || undefined,
          remarks: v.remarks || undefined,
        },
        keyRef.current,
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['booking', booking.id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success(`Refund ${r.number} recorded`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Pay refund" description={`${booking.bookingNumber} · refundable ${formatINR(booking.refundablePaise)}`}>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
          <Field label="Amount" htmlFor="rf-amount" error={e.amount?.message} required>
            <MoneyInput {...form.register('amount')} />
          </Field>
          <Field label="Paid on" htmlFor="rf-date" error={e.paidOn?.message} required>
            <Input type="date" {...form.register('paidOn')} />
          </Field>
          <Field label="Mode" htmlFor="rf-mode">
            <Select {...form.register('mode')}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {titleCase(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" htmlFor="rf-ref">
            <Input {...form.register('reference')} />
          </Field>
          <Field label="Remarks" htmlFor="rf-remarks" className="sm:col-span-2">
            <Textarea rows={2} {...form.register('remarks')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Record refund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
