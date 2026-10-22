# API reference (v1)

Base URL: `/api/v1`. All requests and responses are JSON unless noted.

```jsonc
// Success
{ "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 134, "totalPages": 7 } }
// Failure
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "path": "phone", "message": "…" }], "requestId": "…" } }
```

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Schema validation failed |
| 401 | `UNAUTHENTICATED` / `TOKEN_EXPIRED` | Missing, invalid or expired token; revoked session |
| 403 | `FORBIDDEN` / `CSRF` | Missing permission, inactive membership, bad CSRF token |
| 404 | `NOT_FOUND` | Missing **or not visible to you** (other tenant or project) |
| 409 | `CONFLICT` / `IDEMPOTENCY_CONFLICT` | Duplicate unique value, plot already booked, request in flight |
| 422 | `BUSINESS_RULE` / `IDEMPOTENCY_CONFLICT` | Rule violation (e.g. overpayment rejected); key reused with a different body |
| 429 | `RATE_LIMITED` | Too many requests |

**Conventions**
- Money is integer **paise**, percentages are **basis points**, and areas are **hundredths of a sq ft**.
- Calendar dates are `YYYY-MM-DD`. Timestamps are ISO-8601 UTC.
- List endpoints accept `page`, `pageSize` (≤100), `sort` (`field` or `-field`, allow-listed) and `q`.
- `Authorization: Bearer <accessToken>` is required everywhere except the public `/auth/*` routes.
- Endpoints marked 🔑 require an `Idempotency-Key` header (8–100 chars, e.g. a UUID).

## Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | `{name,email,password,companyName}`. Creates the user, the company (roles and chart of accounts) and the owner membership. Sets cookies |
| POST | `/auth/login` | `{email,password}`. Returns `accessToken` plus auth context. Sets `erp_rt` (HttpOnly) and `erp_csrf` |
| POST | `/auth/refresh` | Cookie plus `x-csrf-token` header. Rotates the refresh token |
| POST | `/auth/logout` | Cookie plus CSRF. Revokes the session |
| GET | `/auth/me` | User, companies, active company with permissions and project access |
| POST | `/auth/select-company` | `{companyId}`. Membership verified server-side |
| GET / DELETE | `/auth/sessions[/:id]` | List and revoke your own sessions |
| POST | `/auth/change-password` | Revokes your other sessions |
| POST | `/auth/forgot-password`, `/auth/reset-password` | Single-use token, 1 h |
| POST | `/auth/verify-email`, `/auth/resend-verification` | Single-use token, 48 h |
| GET | `/auth/invitations/:token` | Public invitation details |
| POST | `/auth/accept-invite` | New user `{token,name,password}`; existing user signed in `{token}` |

## Company, users, roles, audit, notifications

| Method | Path | Permission |
| --- | --- | --- |
| GET / PATCH | `/company` | `company.read` / `company.update` |
| GET | `/users` | `users.read` (memberships with user and role) |
| PATCH | `/users/:membershipId` | `users.update` (status changes also need `users.deactivate`; last-owner and self protections apply) |
| GET / POST / DELETE | `/invitations[/:id]` | `users.read` / `users.create` |
| GET | `/permissions` | any member (catalog) |
| GET / POST / PATCH / DELETE | `/roles[/:id]` | `roles.*` |
| GET | `/audit-logs?entityType&entityId&actorId&action&from&to` | `audit.read` |
| GET | `/notifications?unread=true` · POST `/notifications/:id/read` · POST `/notifications/read-all` | own notifications |

## Projects and inventory

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/projects` | `projects.read` / `projects.create` |
| GET / PATCH | `/projects/:id` | `projects.read` / `projects.update` |
| POST | `/projects/:id/archive` | `projects.archive` (blocked while plots are reserved or booked) |
| POST / PATCH / DELETE | `/projects/:id/phases[/:phaseId]`, `/projects/:id/blocks[/:blockId]` | `projects.update` |
| GET | `/projects/:id/plots?status&blockId&phaseId&category&q&sort` | `inventory.read` |
| POST | `/projects/:id/plots` · `/projects/:id/plots/bulk` | `inventory.create` |
| GET / PATCH / DELETE | `/projects/:id/plots/:plotId` | `inventory.read` / `.update` / `.delete` |
| POST | `/projects/:id/plots/:plotId/status` | `inventory.status`: `{status, reason}`; manual transitions only (block, unblock, sold) |
| GET | `/projects/:id/plots.xlsx` | `inventory.read` + `reports.export` |
| GET | `/projects/:id/map` | `map.read`: map config, per-status summary, plot shapes |
| PUT | `/projects/:id/map` · `/projects/:id/map/shapes` | `map.edit` |

## Sales

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/customers` | `customers.read` / `.create` |
| GET / PATCH / DELETE | `/customers/:id` | `customers.*` (delete is soft and blocked if bookings exist) |
| GET | `/customers/:id/ledger` | `customers.read` + `payments.read` |
| GET / POST | `/brokers` | `brokers.*` |
| GET / POST / PUT | `/payment-plans[/:id]?projectId` | `paymentPlans.*` |
| POST | `/bookings/quote` | `bookings.read`: pricing and schedule preview, nothing is held |
| GET | `/bookings?projectId&status&customerId&q` · `/bookings/export.xlsx` | `bookings.read` |
| POST 🔑 | `/bookings` | `bookings.create` (+ `bookings.discount` when discounting) |
| GET | `/bookings/:id` · `/bookings/:id/allotment.pdf` | `bookings.read` |
| POST | `/bookings/:id/confirm` | `bookings.confirm` |
| POST | `/bookings/:id/cancel` | `bookings.cancel`: `{reason, cancellationChargePaise}` |
| POST 🔑 | `/bookings/:id/refunds` | `payments.refund` |
| GET | `/payments?projectId&bookingId&customerId&kind&from&to&q` · `/payments/export.xlsx` | `payments.read` |
| POST 🔑 | `/payments` | `payments.create`: `{bookingId, amountPaise, mode, receivedOn, reference?, depositAccountId?}` |
| GET | `/payments/:id` · `/payments/:id/receipt.pdf` | `payments.read` |
| POST | `/payments/:id/reverse` | `payments.reverse`: `{reason}` |

## Accounting and reports

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST / PATCH | `/accounting/accounts[/:id]` | `accounting.read` / `accounting.manageAccounts` |
| GET / POST | `/accounting/journal-entries` | `accounting.read` / `accounting.create` (manual vouchers; control accounts blocked) |
| GET | `/accounting/journal-entries/:id` | `accounting.read` |
| POST | `/accounting/journal-entries/:id/reverse` | `accounting.reverse` (manual entries only) |
| GET | `/accounting/reports/trial-balance?asOf&projectId` | `reports.read` + `accounting.read` |
| GET | `/accounting/reports/profit-loss?from&to&projectId` | 〃 |
| GET | `/accounting/reports/balance-sheet?asOf&projectId` | 〃 |
| GET | `/accounting/reports/ledger/:accountId?from&to&projectId` | 〃 |
| GET | `/dashboard?projectId` | `dashboard.read` (sections are gated by module read permissions) |
| GET | `/search?q` | results limited to modules you can read |
| GET | `/api/health` | public liveness and DB check (outside `/v1`) |
