# Plotline — Real Estate Colony Management ERP

A multi-tenant ERP for Indian colonizers, plotted-development builders and real estate developers. It covers projects and plot inventory, interactive layout maps, customers, bookings, installment schedules, receipts, refunds and double-entry accounting.

The workflows are modelled on the kind of features colony-management software is publicly advertised with. The code, design and branding are original.

**Stack:** React 19, TypeScript, Vite, Tailwind CSS v4 and shadcn/ui-style components (Radix), TanStack Query, React Hook Form, Recharts. The backend is Node.js with Express 5 and TypeScript, on MongoDB through Mongoose 8. Zod schemas are shared between client and server. Tests use Vitest, Supertest, React Testing Library and mongodb-memory-server.

---

## Status: Phase 1 (core) is complete

| Area | Status |
| --- | --- |
| Auth: register, login, rotating refresh tokens, logout, sessions, password reset, email verification, invitations | ✅ |
| Multi-company tenancy, company switching, RBAC with project-level restrictions, audit log | ✅ |
| Companies, projects, phases, blocks | ✅ |
| Plot inventory (single and bulk), status history, Excel export | ✅ |
| Interactive SVG plot map: live status, zoom/pan, built-in layout editor | ✅ |
| Customers with co-applicants, customer ledger | ✅ |
| Payment plans (%, fixed, balance, EMIs) and live schedule preview | ✅ |
| Quotations, reservations with expiry, bookings, cancellation, allotment letters (PDF) | ✅ |
| Receipts (FIFO allocation, partial, advance or reject on overpayment), reversals, refunds, receipt PDFs | ✅ |
| Double-entry accounting: chart of accounts, vouchers, reversals, trial balance, P&L, balance sheet, ledgers | ✅ |
| Dashboard KPIs and charts, computed from the database | ✅ |
| Notifications: installment reminder job and in-app bell | ✅ |
| Global search, server-side pagination, sorting and filtering | ✅ |
| Land acquisition, CRM pipeline, construction/vendors/work orders/expenses, document storage | ⏳ Phase 2. The data models exist; see [docs/roadmap.md](docs/roadmap.md) |

## Quick start

Requirements: **Node.js ≥ 20.19** and **MongoDB running as a replica set**, which multi-document transactions need.

```bash
npm install
cp .env.example .env                 # then set JWT_ACCESS_SECRET

# Start MongoDB as a single-node replica set (choose one)
docker compose up -d mongo           # Docker
npm run db:local                     # or a local mongod binary (MONGOD_BIN=/path/to/mongod)

npm run seed -- --reset              # demo company, project, 48 mapped plots, bookings and receipts
npm run dev                          # API on :4000, web on :5173 (Vite proxies /api)
```

Open http://localhost:5173 and sign in with a seed account:

| Role | Email | Password |
| --- | --- | --- |
| Owner (all permissions) | `admin@demo.local` | `DemoAdmin@2026` |
| Sales Executive (one project only) | `sales@demo.local` | `DemoSales@2026` |

Seed accounts are flagged `isDevSeed`. The API **refuses to start in production** while any of them is active.

### Full stack in Docker

```bash
export JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
docker compose up -d --build                     # production mode
# or, with demo data (seed accounts are refused in production mode):
NODE_ENV=development docker compose up -d --build
docker compose exec api node apps/api/dist/scripts/seed.js --reset
# http://localhost:8080
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (tsx watch) and web (Vite) together |
| `npm run typecheck` | `tsc` across all workspaces |
| `npm test` | Shared unit tests, API integration tests (in-memory replica set), web component tests |
| `npm run build` | API bundle (tsup) and web production build |
| `npm run seed -- --reset` | Wipe the dev database and load demo data |
| `npm run db:indexes --workspace @erp/api` | Create/update MongoDB indexes (run on every deploy) |

## Repository layout

```
apps/
  api/             Express + Mongoose API
    src/
      config/      env validation, DB connection (fails fast without a replica set)
      db/          tenant guard plugin, transactions, counters, idempotency store
      middleware/  auth, tenant context, authorize, validate, idempotency, CSRF, rate limit, errors
      modules/     auth, companies, users, roles, projects, plots, customers, bookings,
                   payments, accounting, reports, land*, crm*, construction*, documents*, notifications, audit
      jobs/        reservation expiry, installment reminders
      scripts/     seed
    test/          Supertest integration tests
  web/             React SPA
    src/
      app/         router (lazy routes, guards)
      components/  ui primitives (shadcn-style), data table, states, forms
      features/    auth, dashboard, projects, inventory, map, customers, bookings, payments, accounting, admin
      hooks/ lib/ layouts/
packages/
  shared/          Zod schemas, permission catalog, status machines, money/date utils, schedule generator
docs/              architecture, API, security, deployment, roadmap
deploy/            nginx config
```
\* model only in Phase 1.

The tests sit next to the code they cover, in `apps/api/test`, `apps/web/src/**/*.test.tsx` and `packages/shared/src/*.test.ts`, rather than in a top-level `tests/` folder. That way each workspace runs independently.

## Documentation

- [Architecture & data model](docs/architecture.md): tenancy, money, bookings, accounting design
- [API reference](docs/api.md)
- [Security](docs/security.md)
- [Deployment](docs/deployment.md)
- [Roadmap](docs/roadmap.md)
