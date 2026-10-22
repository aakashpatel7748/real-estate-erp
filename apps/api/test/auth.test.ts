import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { api, getApp, registerCompany } from './helpers';

describe('authentication & sessions', () => {
  it('registers, returns an access token and sets HttpOnly refresh + CSRF cookies', async () => {
    const res = await request(getApp())
      .post('/api/v1/auth/register')
      .send({ name: 'Asha', email: 'asha@example.com', password: 'Str0ngPassw0rd!', companyName: 'Asha Infra' })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.activeCompany.permissions).toContain('bookings.create');
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/erp_rt=[^;]+;.*HttpOnly/);
    expect(cookies).toMatch(/erp_rt=[^;]+;.*SameSite=Strict/);
    expect(cookies).toMatch(/erp_csrf=/);
    expect(res.body.data).not.toHaveProperty('refreshToken');
  });

  it('rejects weak passwords and duplicate emails with consistent error envelopes', async () => {
    const weak = await request(getApp())
      .post('/api/v1/auth/register')
      .send({ name: 'A', email: 'weak@example.com', password: 'short', companyName: 'X' })
      .expect(400);
    expect(weak.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(weak.body.error.details[0].path).toBe('password');

    await request(getApp())
      .post('/api/v1/auth/register')
      .send({ name: 'Asha', email: 'asha@example.com', password: 'Str0ngPassw0rd!', companyName: 'Dup' })
      .expect(409);
  });

  it('rejects bad credentials without revealing which part was wrong', async () => {
    const a = await request(getApp()).post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'wrong' }).expect(401);
    const b = await request(getApp()).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'wrong' }).expect(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('requires a bearer token for protected routes', async () => {
    await request(getApp()).get('/api/v1/projects').expect(401);
    await request(getApp()).get('/api/v1/projects').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('rotates refresh tokens, enforces CSRF and detects token reuse', async () => {
    const s = await registerCompany();
    const rt = s.cookies.find((c) => c.startsWith('erp_rt='))!;
    const csrfCookie = s.cookies.find((c) => c.startsWith('erp_csrf='))!;

    // No CSRF header -> rejected.
    await request(getApp()).post('/api/v1/auth/refresh').set('Cookie', [rt, csrfCookie]).expect(403);

    const r1 = await request(getApp()).post('/api/v1/auth/refresh').set('Cookie', [rt, csrfCookie]).set('x-csrf-token', s.csrf).expect(200);
    const newRt = (r1.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('erp_rt='))!.split(';')[0]!;
    expect(newRt).not.toBe(rt);

    // Wait past the concurrency grace window by back-dating the rotation.
    const { Session } = await import('../src/modules/auth/auth.models');
    await Session.updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });

    // Replaying the old token is treated as theft: the whole session is revoked.
    await request(getApp()).post('/api/v1/auth/refresh').set('Cookie', [rt, csrfCookie]).set('x-csrf-token', s.csrf).expect(401);
    await request(getApp()).post('/api/v1/auth/refresh').set('Cookie', [newRt, csrfCookie]).set('x-csrf-token', s.csrf).expect(401);
    // The access token is invalidated immediately as well.
    await api(s).get('/projects').expect(401);
  });

  it('logout revokes the session and its access tokens', async () => {
    const s = await registerCompany();
    await api(s).get('/projects').expect(200);
    await request(getApp())
      .post('/api/v1/auth/logout')
      .set('Cookie', s.cookies)
      .set('x-csrf-token', s.csrf)
      .expect(200);
    await api(s).get('/projects').expect(401);
  });

  it('only lets users select companies they belong to', async () => {
    const a = await registerCompany('A Co');
    const b = await registerCompany('B Co');
    await api(a).post('/auth/select-company', { companyId: b.companyId }).expect(404);
    const ok = await api(a).post('/auth/select-company', { companyId: a.companyId }).expect(200);
    expect(ok.body.data.activeCompany.id).toBe(a.companyId);
  });

  it('supports password reset and revokes existing sessions', async () => {
    const { testOutbox } = await import('../src/utils/mailer');
    const s = await registerCompany();
    const me = (await api(s).get('/auth/me').expect(200)).body.data.user;
    await request(getApp()).post('/api/v1/auth/forgot-password').send({ email: me.email }).expect(200);
    const mail = testOutbox.filter((m) => m.to === me.email && m.subject.includes('Reset')).at(-1)!;
    const token = /token=([\w-]+)/.exec(mail.text)![1];
    await request(getApp()).post('/api/v1/auth/reset-password').send({ token, password: 'An0therStr0ngOne' }).expect(200);
    await api(s).get('/projects').expect(401);
    // Tokens are single use.
    await request(getApp()).post('/api/v1/auth/reset-password').send({ token, password: 'An0therStr0ngOne' }).expect(400);
    await request(getApp()).post('/api/v1/auth/login').send({ email: me.email, password: 'An0therStr0ngOne' }).expect(200);
  });

  it('verifies email with a single-use token', async () => {
    const { testOutbox } = await import('../src/utils/mailer');
    const s = await registerCompany();
    const me = (await api(s).get('/auth/me').expect(200)).body.data.user;
    expect(me.emailVerified).toBe(false);
    const mail = testOutbox.filter((m) => m.to === me.email && m.subject.includes('Verify')).at(-1)!;
    const token = /token=([\w-]+)/.exec(mail.text)![1];
    await request(getApp()).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    expect((await api(s).get('/auth/me')).body.data.user.emailVerified).toBe(true);
  });
});
