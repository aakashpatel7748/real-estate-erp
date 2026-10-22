# Deployment

## Components

| Component | Recommended |
| --- | --- |
| Web (static SPA) | The `apps/web` Docker image (nginx), or any static host / CDN. It must route `/api/*` to the API on the **same origin** |
| API | The `apps/api` Docker image on any container platform (ECS, Cloud Run, Fly, Render, Kubernetes, a VM with Docker) |
| Database | MongoDB **replica set**: Atlas M10+ in the Mumbai region (`ap-south-1`) or a self-managed 3-node replica set |
| File storage (Phase 2) | A private S3-compatible bucket (AWS S3 / Cloudflare R2 / MinIO) with block-public-access enabled |
| Email | Any SMTP provider (SES, Postmark, Zoho, etc.) through `SMTP_URL` |

## Steps

1. **Database.** Create a replica set, a database user scoped to the app database, and allow-list the API's egress IPs. Use a connection string with `retryWrites=true&w=majority`.
2. **Indexes.** Production has `autoIndex` off. Build and update indexes in every release job, before new API containers take traffic:
   ```bash
   docker run --rm -e NODE_ENV=production -e MONGODB_URI=... -e JWT_ACCESS_SECRET=... erp-api \
     node apps/api/dist/scripts/sync-indexes.js
   ```
   The unique indexes (plot numbers, receipt numbers, one active booking per plot, idempotency keys) are part of the integrity guarantees, so do not skip this step.
3. **API.** Build `docker build -f apps/api/Dockerfile -t erp-api .` and set these env vars (see `.env.example`):
   `NODE_ENV=production`, `MONGODB_URI`, `JWT_ACCESS_SECRET`, `APP_URL`, `CORS_ORIGINS`, `TRUST_PROXY`, `SMTP_URL`, `MAIL_FROM`.
   The health check is `GET /api/health`, which returns 503 while the database is down. Shutdown on SIGTERM is graceful.
4. **Jobs.** They run inside the API process (`JOBS_ENABLED=true`). When you run several API replicas, enable jobs on **one** of them, or move them to a scheduled task. Both jobs are idempotent: expiry uses conditional updates and reminders use dedupe keys.
5. **Web.** Build `docker build -f apps/web/Dockerfile -t erp-web .`. The bundled `deploy/nginx.conf` proxies `/api` to `http://api:4000`, so change the upstream for your network. Put TLS in front with a load balancer, Caddy or Cloudflare.
6. **First company.** Open the site and register. The registering user becomes the company owner. Do not run the seed script in production.

## Single VM (docker compose)

```bash
export JWT_ACCESS_SECRET=...   # random, ≥48 bytes
docker compose up -d --build
```
For a real server, remove `COOKIE_SECURE: 'false'` from `docker-compose.yml` and terminate HTTPS in front of the `web` service.

## Backups and operations

- Use point-in-time backups (Atlas) or `mongodump` with the oplog on a schedule, and test restores.
- Journal entries and audit logs are append-only by design, so do not "fix" data with direct database writes. Use the reversal workflows.
- The API writes structured JSON logs (pino) with a request ID. Correlate with the `x-request-id` response header and the reference shown in UI error states.
