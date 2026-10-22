export const PLOT_STATUSES = ['available', 'reserved', 'booked', 'sold', 'blocked'] as const;
export type PlotStatus = (typeof PLOT_STATUSES)[number];

/** Manual transitions an operator may perform from the inventory screen. */
export const MANUAL_PLOT_TRANSITIONS: Record<PlotStatus, PlotStatus[]> = {
  available: ['blocked'],
  blocked: ['available'],
  reserved: [],
  booked: ['sold'],
  sold: [],
};

export const PLOT_FACINGS = ['north', 'south', 'east', 'west', 'north_east', 'north_west', 'south_east', 'south_west'] as const;
export const PLOT_CATEGORIES = ['residential', 'commercial', 'mixed', 'amenity'] as const;

export const BOOKING_STATUSES = ['reserved', 'booked', 'cancelled', 'expired'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Booking state machine. Terminal states have no outgoing transitions. */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  reserved: ['booked', 'cancelled', 'expired'],
  booked: ['cancelled'],
  cancelled: [],
  expired: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export const PROJECT_STATUSES = ['planning', 'active', 'completed', 'on_hold', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PAYMENT_MODES = ['cash', 'cheque', 'upi', 'neft', 'rtgs', 'imps', 'card', 'demand_draft', 'other'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_STATUSES = ['received', 'reversed'] as const;
export const PAYMENT_KINDS = ['receipt', 'refund'] as const;

export const INSTALLMENT_STATUSES = ['pending', 'partial', 'paid', 'cancelled'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Normal balance side by account type. */
export const NORMAL_BALANCE: Record<AccountType, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  income: 'credit',
};

export const VOUCHER_TYPES = ['journal', 'receipt', 'payment', 'contra', 'sales', 'reversal'] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

/**
 * System accounts every company gets. Services look these up by `systemKey`,
 * never by name, so users may rename them.
 */
export const SYSTEM_ACCOUNTS = [
  { systemKey: 'cash', code: '1000', name: 'Cash in Hand', type: 'asset' },
  { systemKey: 'bank', code: '1010', name: 'Bank Account', type: 'asset' },
  { systemKey: 'customer_receivable', code: '1100', name: 'Customer Receivables', type: 'asset' },
  { systemKey: 'land_inventory', code: '1300', name: 'Land & Development (WIP)', type: 'asset' },
  { systemKey: 'customer_advance', code: '2100', name: 'Customer Advances', type: 'liability' },
  { systemKey: 'refund_payable', code: '2200', name: 'Refunds Payable', type: 'liability' },
  { systemKey: 'vendor_payable', code: '2300', name: 'Vendor Payables', type: 'liability' },
  { systemKey: 'capital', code: '3000', name: "Owner's Capital", type: 'equity' },
  { systemKey: 'plot_sales', code: '4000', name: 'Plot Sales', type: 'income' },
  { systemKey: 'cancellation_income', code: '4100', name: 'Cancellation Charges', type: 'income' },
  { systemKey: 'other_income', code: '4900', name: 'Other Income', type: 'income' },
  { systemKey: 'development_expense', code: '5000', name: 'Development Expenses', type: 'expense' },
  { systemKey: 'admin_expense', code: '5100', name: 'Administrative Expenses', type: 'expense' },
  { systemKey: 'brokerage_expense', code: '5200', name: 'Brokerage & Commission', type: 'expense' },
] as const;
export type SystemAccountKey = (typeof SYSTEM_ACCOUNTS)[number]['systemKey'];

export const OVERPAYMENT_POLICIES = ['reject', 'advance'] as const;
export type OverpaymentPolicy = (typeof OVERPAYMENT_POLICIES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'invited', 'disabled'] as const;

export const LEAD_STATUSES = ['new', 'contacted', 'site_visit', 'negotiation', 'won', 'lost'] as const;
export const LAND_STATUSES = ['negotiation', 'agreement', 'registered', 'converted', 'dropped'] as const;
export const WORK_ORDER_STATUSES = ['draft', 'issued', 'in_progress', 'completed', 'cancelled'] as const;
export const DOCUMENT_ENTITY_TYPES = [
  'project',
  'land_parcel',
  'plot',
  'customer',
  'booking',
  'payment',
  'vendor',
  'work_order',
  'company',
] as const;
