import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { api, bookingBody, getApp, key, registerCompany, setupInventory } from './helpers';

describe('tenant isolation & authorization', () => {
  it('never exposes another company’s records, even with a known id', async () => {
    const a = await registerCompany('Alpha');
    const b = await registerCompany('Beta');
    const invA = await setupInventory(a, 2, 'ALP');

    const http = api(b);
    await http.get(`/projects/${invA.project.id}`).expect(404);
    await http.get(`/projects/${invA.project.id}/plots`).expect(404);
    await http.get(`/customers/${invA.customer.id}`).expect(404);
    await http.patch(`/projects/${invA.project.id}`, { name: 'Hijacked' }).expect(404);
    expect((await http.get('/projects').expect(200)).body.data).toHaveLength(0);

    // Cross-tenant references inside a request body are rejected too.
    const invB = await setupInventory(b, 1, 'BET');
    const res = await http.post('/bookings', { ...bookingBody(invB), customerId: invA.customer.id }, key());
    expect(res.status).toBe(404);
    const res2 = await http.post('/bookings', { ...bookingBody(invB), plotIds: [invA.plots[0]!.id] }, key());
    expect(res2.status).toBe(400);
  });

  it('enforces permissions on the server and project-level restrictions', async () => {
    const owner = await registerCompany('Gamma');
    const inv1 = await setupInventory(owner, 1, 'G1');
    const inv2 = await setupInventory(owner, 1, 'G2');
    const http = api(owner);

    const roles = (await http.get('/roles').expect(200)).body.data as { id: string; systemKey?: string }[];
    const viewer = roles.find((r) => r.systemKey === 'viewer')!;
    const { testOutbox } = await import('../src/utils/mailer');

    await http.post('/invitations', { email: 'viewer@example.com', roleId: viewer.id, projectAccess: { mode: 'restricted', projectIds: [inv1.project.id] } }).expect(201);
    const token = /token=([\w-]+)/.exec(testOutbox.filter((m) => m.to === 'viewer@example.com').at(-1)!.text)![1];
    const accepted = await request(getApp())
      .post('/api/v1/auth/accept-invite')
      .send({ token, name: 'Vik Viewer', password: 'Str0ngPassw0rd!' })
      .expect(201);
    const v = { token: accepted.body.data.accessToken as string };

    // Read allowed, write denied.
    await api(v).get(`/projects/${inv1.project.id}`).expect(200);
    const denied = await api(v).post('/projects', { name: 'Nope', code: 'NOPE' }).expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    await api(v).post('/bookings', bookingBody(inv1), key()).expect(403);

    // Project restriction: the other project is invisible.
    await api(v).get(`/projects/${inv2.project.id}`).expect(404);
    const list = (await api(v).get('/projects').expect(200)).body.data as { id: string }[];
    expect(list.map((p) => p.id)).toEqual([inv1.project.id]);

    // Disabling the membership locks the user out immediately.
    const members = (await http.get('/users').expect(200)).body.data as { id: string; userId: { email: string } }[];
    const m = members.find((x) => x.userId.email === 'viewer@example.com')!;
    await http.patch(`/users/${m.id}`, { status: 'disabled' }).expect(200);
    await api(v).get(`/projects/${inv1.project.id}`).expect(403);
  });

  it('protects the last owner and prevents self-demotion', async () => {
    const owner = await registerCompany('Delta');
    const http = api(owner);
    const members = (await http.get('/users').expect(200)).body.data as { id: string }[];
    await http.patch(`/users/${members[0]!.id}`, { status: 'disabled' }).expect(403);
  });

  it('fails loudly on unscoped queries against tenant collections', async () => {
    const { Plot } = await import('../src/modules/plots/plot.models');
    await expect(Plot.find({ status: 'available' })).rejects.toThrow(/companyId/);
    await expect(Plot.aggregate([{ $match: { status: 'available' } }])).rejects.toThrow(/companyId/);
  });

  it('records audit logs for sensitive operations, readable only within the company', async () => {
    const owner = await registerCompany('Epsilon');
    const inv = await setupInventory(owner, 1, 'EPS');
    await api(owner).post('/bookings', bookingBody(inv), key()).expect(201);
    const logs = (await api(owner).get('/audit-logs?action=bookings').expect(200)).body.data as { action: string }[];
    expect(logs.map((l) => l.action)).toContain('bookings.create');
    const other = await registerCompany('Zeta');
    const otherLogs = (await api(other).get('/audit-logs?action=bookings').expect(200)).body.data;
    expect(otherLogs).toHaveLength(0);
  });
});
