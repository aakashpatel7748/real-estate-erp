import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateSchedule, paymentPlanSchema, todayInIndia, type PaymentPlanRule } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';
import { useProjectContext } from '@/hooks/use-project';
import { Can } from '@/features/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card, Checkbox, Input, Label, Select, Textarea } from '@/components/ui/primitives';
import { Sheet, SheetContent } from '@/components/ui/overlays';
import { Field, PageHeader, StatusBadge } from '@/components/common';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states';
import { MoneyInput, paiseToInput, toBp, toPaise } from '@/components/money';

export interface PaymentPlan {
  id: string;
  name: string;
  description?: string;
  projectId?: string | null;
  isActive: boolean;
  rules: PaymentPlanRule[];
}

interface RuleRow {
  type: 'percent' | 'fixed' | 'balance';
  name: string;
  value: string;
  dueKind: 'on_booking' | 'days_after_booking' | 'months_after_booking' | 'fixed_date';
  dueValue: string;
  repeatCount: string;
  repeatEvery: string;
}
interface PlanForm {
  name: string;
  description: string;
  projectId: string;
  isActive: boolean;
  rules: RuleRow[];
}

function rowToRule(r: RuleRow): PaymentPlanRule {
  const due =
    r.dueKind === 'on_booking'
      ? { kind: 'on_booking' as const }
      : r.dueKind === 'days_after_booking'
        ? { kind: 'days_after_booking' as const, days: Number(r.dueValue || 0) }
        : r.dueKind === 'months_after_booking'
          ? { kind: 'months_after_booking' as const, months: Number(r.dueValue || 0) }
          : { kind: 'fixed_date' as const, date: r.dueValue };
  const repeat = Number(r.repeatCount) > 1 ? { count: Number(r.repeatCount), everyMonths: Number(r.repeatEvery || 1) } : undefined;
  const base = { name: r.name, due, ...(repeat ? { repeat } : {}) };
  if (r.type === 'percent') return { type: 'percent', valueBp: toBp(r.value || '0'), ...base };
  if (r.type === 'fixed') return { type: 'fixed', amountPaise: toPaise(r.value || '0'), ...base };
  return { type: 'balance', ...base };
}

function ruleToRow(r: PaymentPlanRule): RuleRow {
  const due = r.due;
  return {
    type: r.type,
    name: r.name,
    value: r.type === 'percent' ? String(r.valueBp / 100) : r.type === 'fixed' ? paiseToInput(r.amountPaise) : '',
    dueKind: due.kind,
    dueValue:
      due.kind === 'days_after_booking'
        ? String(due.days)
        : due.kind === 'months_after_booking'
          ? String(due.months)
          : due.kind === 'fixed_date'
            ? due.date
            : '',
    repeatCount: r.repeat ? String(r.repeat.count) : '',
    repeatEvery: r.repeat ? String(r.repeat.everyMonths) : '1',
  };
}

const emptyRow: RuleRow = { type: 'percent', name: '', value: '', dueKind: 'on_booking', dueValue: '', repeatCount: '', repeatEvery: '1' };
const SAMPLE = 10_00_000_00;

function PlanEditor({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (o: boolean) => void; plan?: PaymentPlan }) {
  const qc = useQueryClient();
  const { projects } = useProjectContext();
  const form = useForm<PlanForm>({
    values: {
      name: plan?.name ?? '',
      description: plan?.description ?? '',
      projectId: plan?.projectId ?? '',
      isActive: plan?.isActive ?? true,
      rules: plan?.rules.map(ruleToRow) ?? [
        { ...emptyRow, name: 'Booking amount', value: '10' },
        { ...emptyRow, name: 'Balance', type: 'balance', dueKind: 'months_after_booking', dueValue: '3' },
      ],
    },
  });
  const rules = useFieldArray({ control: form.control, name: 'rules' });
  const [issues, setIssues] = React.useState<string[]>([]);
  const watched = form.watch();

  const parsed = React.useMemo(() => {
    try {
      const candidate = {
        name: watched.name || 'Plan',
        description: watched.description || undefined,
        projectId: watched.projectId || undefined,
        isActive: watched.isActive,
        rules: watched.rules.map(rowToRule),
      };
      const res = paymentPlanSchema.safeParse(candidate);
      if (!res.success) return { error: res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), schedule: null, payload: null };
      return { error: null, schedule: generateSchedule(res.data.rules, SAMPLE, todayInIndia()), payload: res.data };
    } catch (e) {
      return { error: [errorMessage(e)], schedule: null, payload: null };
    }
  }, [watched]);

  const save = useMutation({
    mutationFn: () => {
      if (!parsed.payload) throw new Error('Fix the plan errors first');
      return plan ? api.put(`/payment-plans/${plan.id}`, parsed.payload) : api.post('/payment-plans', parsed.payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-plans'] });
      toast.success('Payment plan saved');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={plan ? 'Edit payment plan' : 'New payment plan'}
        description="Existing bookings keep the schedule they were created with."
        className="sm:max-w-3xl"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              onClick={() => {
                if (!watched.name.trim()) return setIssues(['Plan name is required']);
                if (parsed.error) return setIssues(parsed.error);
                setIssues([]);
                save.mutate();
              }}
            >
              Save plan
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan name" htmlFor="pp-name" required>
            <Input {...form.register('name')} placeholder="e.g. Standard 10-30-60" />
          </Field>
          <Field label="Available for" htmlFor="pp-project">
            <Select {...form.register('projectId')}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor="pp-desc" className="sm:col-span-2">
            <Textarea rows={2} {...form.register('description')} />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id="pp-active" checked={watched.isActive} onCheckedChange={(c) => form.setValue('isActive', c === true)} />
            <Label htmlFor="pp-active">Active (available for new bookings)</Label>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Installment rules</p>
            <Button type="button" size="sm" variant="outline" onClick={() => rules.append({ ...emptyRow })}>
              <Plus /> Add rule
            </Button>
          </div>
          <div className="space-y-3">
            {rules.fields.map((f, i) => {
              const row = watched.rules[i];
              return (
                <div key={f.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Label htmlFor={`r-${i}-name`} className="text-xs">
                      Name
                    </Label>
                    <Input id={`r-${i}-name`} {...form.register(`rules.${i}.name`)} />
                  </div>
                  <div>
                    <Label htmlFor={`r-${i}-type`} className="text-xs">
                      Type
                    </Label>
                    <Select id={`r-${i}-type`} {...form.register(`rules.${i}.type`)}>
                      <option value="percent">% of total</option>
                      <option value="fixed">Fixed ₹</option>
                      <option value="balance">Balance</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`r-${i}-value`} className="text-xs">
                      {row?.type === 'fixed' ? 'Amount' : row?.type === 'percent' ? 'Percent' : 'Value'}
                    </Label>
                    {row?.type === 'fixed' ? (
                      <MoneyInput id={`r-${i}-value`} {...form.register(`rules.${i}.value`)} />
                    ) : (
                      <Input
                        id={`r-${i}-value`}
                        disabled={row?.type === 'balance'}
                        inputMode="decimal"
                        placeholder={row?.type === 'balance' ? 'Remainder' : '%'}
                        {...form.register(`rules.${i}.value`)}
                      />
                    )}
                  </div>
                  <div>
                    <Label htmlFor={`r-${i}-due`} className="text-xs">
                      Due
                    </Label>
                    <Select id={`r-${i}-due`} {...form.register(`rules.${i}.dueKind`)}>
                      <option value="on_booking">On booking</option>
                      <option value="days_after_booking">Days after</option>
                      <option value="months_after_booking">Months after</option>
                      <option value="fixed_date">On date</option>
                    </Select>
                  </div>
                  <div className="flex items-end gap-1">
                    {row?.dueKind !== 'on_booking' && (
                      <div className="flex-1">
                        <Label htmlFor={`r-${i}-dv`} className="text-xs">
                          {row?.dueKind === 'fixed_date' ? 'Date' : row?.dueKind === 'days_after_booking' ? 'Days' : 'Months'}
                        </Label>
                        <Input
                          id={`r-${i}-dv`}
                          type={row?.dueKind === 'fixed_date' ? 'date' : 'text'}
                          inputMode="numeric"
                          {...form.register(`rules.${i}.dueValue`)}
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => rules.remove(i)}
                      aria-label="Remove rule"
                      disabled={rules.fields.length <= 1}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-6">
                    <span>Split into</span>
                    <Input
                      className="h-7 w-16"
                      inputMode="numeric"
                      placeholder="1"
                      aria-label="Number of installments"
                      {...form.register(`rules.${i}.repeatCount`)}
                    />
                    <span>installments every</span>
                    <Input
                      className="h-7 w-14"
                      inputMode="numeric"
                      aria-label="Months between installments"
                      {...form.register(`rules.${i}.repeatEvery`)}
                    />
                    <span>month(s)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {(issues.length > 0 || parsed.error) && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-destructive/40 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200"
          >
            {(issues.length ? issues : (parsed.error ?? [])).map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}

        {parsed.schedule && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Preview for a {formatINR(SAMPLE, { decimals: false })} booking made today</p>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <tbody>
                  {parsed.schedule.map((s) => (
                    <tr key={s.sequence} className="border-b last:border-0">
                      <td className="px-3 py-1.5 text-muted-foreground">{s.sequence}</td>
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5">{formatDate(s.dueDate)}</td>
                      <td className="px-3 py-1.5 text-right tabular">{formatINR(s.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function PaymentPlansPage() {
  const [editing, setEditing] = React.useState<PaymentPlan | 'new' | null>(null);
  const { projects } = useProjectContext();
  const q = useQuery({ queryKey: ['payment-plans'], queryFn: () => api.get<PaymentPlan[]>('/payment-plans') });
  return (
    <>
      <PageHeader
        title="Payment plans"
        description="Reusable installment schedules for bookings"
        actions={
          <Can permission="paymentPlans.create">
            <Button onClick={() => setEditing('new')}>
              <Plus /> New plan
            </Button>
          </Can>
        }
      />
      {q.isPending ? (
        <PageSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No payment plans yet"
            description="Create a plan such as 10% on booking and the balance in 12 monthly EMIs."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((p) => (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.projectId ? (projects.find((x) => x.id === p.projectId)?.name ?? 'One project') : 'All projects'}
                  </p>
                </div>
                <StatusBadge status={p.isActive ? 'active' : 'disabled'} />
              </div>
              {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
              <ul className="mt-3 flex-1 space-y-1 text-sm">
                {p.rules.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {r.name}
                      {r.repeat ? ` ×${r.repeat.count}` : ''}
                    </span>
                    <span className="text-muted-foreground tabular">
                      {r.type === 'percent'
                        ? `${r.valueBp / 100}%`
                        : r.type === 'fixed'
                          ? formatINR(r.amountPaise, { decimals: false })
                          : 'Balance'}
                    </span>
                  </li>
                ))}
              </ul>
              <Can permission="paymentPlans.update">
                <Button variant="outline" size="sm" className="mt-4 self-start" onClick={() => setEditing(p)}>
                  <Pencil /> Edit
                </Button>
              </Can>
            </Card>
          ))}
        </div>
      )}
      <PlanEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        plan={editing && editing !== 'new' ? editing : undefined}
      />
    </>
  );
}
