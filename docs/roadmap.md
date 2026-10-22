# Roadmap

## Phase 1: core (done)

Auth and sessions, tenancy and RBAC, projects and structure, plot inventory, interactive map with editor, customers, payment plans, quotations, reservations, bookings, receipts, reversals, refunds, double-entry accounting and reports, dashboard, notifications job, audit log, search, Excel and PDF output, tests, Docker and CI.

## Phase 2: next modules

The Mongoose models for these already exist, so the data model is complete. What remains is services, routes and screens.

1. **Land acquisition** (`landparcels`): khasra/khata records, owners and shares, agreement → registry → mutation → land-use conversion. Payments to land owners post to Land & Development (WIP). Documents link to the parcel.
2. **Document management** (`documents`): private S3-compatible storage, presigned PUT uploads with server-side type, size and checksum validation, authorized short-lived GET URLs, and attachments on projects, plots, customers, bookings and payments.
3. **CRM** (`leads`, `leadactivities`): pipeline board, follow-up reminders, assignment, lead → customer conversion, and source analytics.
4. **Construction and vendors** (`vendors`, `workorders`, `expenses`): work orders with milestones, vendor bills (Dr expense/WIP, Cr Vendor Payables), payments, project cost reports.
5. **Broker commissions**: accrue on confirmation (Dr Brokerage, Cr Payables) and settle with payouts.

## Phase 3: enhancements

- Saved quotations with validity and conversion to booking
- Email, SMS and WhatsApp reminders (provider adapters) alongside in-app notifications
- GST on applicable charges and TDS on property purchases (Section 194-IA) in receipts and reports
- Cheque clearing workflow (received → deposited → cleared/bounced)
- Map background layer (uploaded layout image) using document storage
- Server-sent events for instant map updates (currently 15 s polling)
- Customer self-service portal (statement, receipts, dues)
- Fine-grained field-level audit diffs and configurable data-retention and archival policies
