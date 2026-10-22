# Security

| Concern | Control |
| --- | --- |
| Password storage | Argon2id: 19 MiB memory, t=2, p=1 (OWASP baseline). Unknown users get an equal-time hash |
| Brute force | IP + email rate limiter on credential endpoints, plus an account lockout of 15 minutes after 8 failures |
| Session tokens | 15-minute JWT access token kept in memory only. Refresh token is 256-bit random, stored **hashed**, sent in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth` |
| Token theft | The refresh token rotates on every use. Replaying a rotated token outside a 15-second multi-tab grace window **revokes the whole session**. Access tokens check their session on every request, so revocation is immediate |
| CSRF | Cookie-authenticated endpoints (refresh, logout) need a double-submit `x-csrf-token` header. All other endpoints use a bearer header, which browsers do not attach automatically |
| Broken access control | Server-built tenant context, per-route permissions, project scoping, 404 for out-of-scope IDs, cross-reference validation, and a Mongoose plugin that rejects unscoped tenant queries |
| Mass assignment / NoSQL injection | Every body, query and param is parsed with a strict Zod schema that strips unknown keys, so `$`-operators never reach Mongo. Sort fields are allow-listed and regex input is escaped |
| XSS | React escapes output and there is no `dangerouslySetInnerHTML`. Nginx sends a strict CSP. Helmet sets API headers, including a `default-src 'none'` CSP |
| Secrets | Env vars are validated at boot. Production refuses placeholder JWT secrets and active dev-seed accounts. Logs redact authorization headers, cookies, passwords and tokens |
| Error leakage | The central error handler returns a consistent envelope plus a request ID. It never sends stack traces or database internals in production |
| Financial integrity | Integer paise, transactions, idempotency keys, optimistic guards, immutable journal entries, reversal-only corrections |
| PII minimisation | Only the last 4 digits of Aadhaar are stored. PAN is format-validated |
| Audit | Append-only audit log for auth events, bookings, payments, reversals, refunds, role and permission changes, membership changes and inventory status changes. Each record carries the actor, IP, user agent and request ID |
| Documents (Phase 2) | Metadata stores only the private storage key (`select:false`). Downloads will go through authorized, short-lived signed URLs |

## Production checklist

- [ ] Set `NODE_ENV=production` and a random `JWT_ACCESS_SECRET` of at least 48 bytes, kept in a secret manager.
- [ ] Serve over HTTPS on one origin (SPA plus `/api` reverse proxy), or adjust `CORS_ORIGINS` and the cookie settings deliberately.
- [ ] Set `TRUST_PROXY` to the number of proxies in front of the API so rate limiting sees real client IPs.
- [ ] Configure `SMTP_URL` for verification, reset and invitation emails.
- [ ] Use MongoDB with authentication, TLS, a least-privilege application user and backups. Run `syncIndexes` during deploy, since `autoIndex` is off in production.
- [ ] Disable or delete the seed users. The API will not start otherwise.
- [ ] Ship logs (pino JSON) to your log platform and alert on 5xx responses and `auth.refresh_reuse_detected` audit events.
