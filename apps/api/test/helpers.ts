import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { createApp } from '../src/app';

let app: Express | undefined;
export function getApp(): Express {
  app ??= createApp();
  return app;
}

export interface Session {
  token: string;
  companyId: string;
  userId: string;
  cookies: string[];
  csrf: string;
}

function extractCookies(res: request.Response): { cookies: string[]; csrf: string } {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookies = (raw ?? []).map((c) => c.split(';')[0]!);
  const csrf = cookies.find((c) => c.startsWith('erp_csrf='))?.split('=')[1] ?? '';
  return { cookies, csrf };
}

let counter = 0;
export async function registerCompany(name = 'Acme Developers'): Promise<Session> {
  counter++;
  const res = await request(getApp())
    .post('/api/v1/auth/register')
    .send({
      name: `Owner ${counter}`,
      email: `owner${counter}.${randomUUID().slice(0, 6)}@example.com`,
      password: 'Str0ngPassw0rd!',
      companyName: name,
    })
    .expect(201);
  return {
    token: res.body.data.accessToken,
    companyId: res.body.data.activeCompany.id,
    userId: res.body.data.user.id,
    ...extractCookies(res),
  };
}

export async function login(email: string, password: string): Promise<Session & { body: unknown }> {
  const res = await request(getApp()).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return {
    token: res.body.data.accessToken,
    companyId: res.body.data.activeCompany?.id,
    userId: res.body.data.user.id,
    body: res.body,
    ...extractCookies(res),
  };
}

/** Authenticated request helpers. */
export function api(s: Pick<Session, 'token'>) {
  const a = getApp();
  return {
    get: (url: string) => request(a).get(`/api/v1${url}`).set('Authorization', `Bearer ${s.token}`),
    post: (url: string, body?: object, idempotencyKey?: string) => {
      const r = request(a).post(`/api/v1${url}`).set('Authorization', `Bearer ${s.token}`);
      if (idempotencyKey) r.set('Idempotency-Key', idempotencyKey);
      return r.send(body ?? {});
    },
    patch: (url: string, body: object) => request(a).patch(`/api/v1${url}`).set('Authorization', `Bearer ${s.token}`).send(body),
    put: (url: string, body: object) => request(a).put(`/api/v1${url}`).set('Authorization', `Bearer ${s.token}`).send(body),
    delete: (url: string) => request(a).delete(`/api/v1${url}`).set('Authorization', `Bearer ${s.token}`),
  };
}

export const key = () => randomUUID();

/** Creates a project with `count` plots of 1000 sq ft at ₹1,000/sq ft (₹10,00,000 each), a plan and a customer. */
export async function setupInventory(s: Session, count = 3, code = 'PRJ') {
  const http = api(s);
  const project = (await http.post('/projects', { name: `Project ${code}`, code, status: 'active' }).expect(201)).body.data;
  await http
    .post(`/projects/${project.id}/plots/bulk`, { startNumber: 1, count, areaX100: 100_000, ratePaisePerSqft: 100_000 })
    .expect(201);
  const plots = (await http.get(`/projects/${project.id}/plots?pageSize=100`).expect(200)).body.data as {
    id: string;
    plotNumber: string;
  }[];
  const plan = (
    await http
      .post('/payment-plans', {
        name: `Plan ${code}`,
        rules: [
          { type: 'percent', name: 'Booking', valueBp: 2_000, due: { kind: 'on_booking' } },
          { type: 'percent', name: 'Second', valueBp: 3_000, due: { kind: 'days_after_booking', days: 30 } },
          { type: 'percent', name: 'Final', valueBp: 5_000, due: { kind: 'months_after_booking', months: 3 } },
        ],
      })
      .expect(201)
  ).body.data;
  const customer = (await http.post('/customers', { name: 'Test Buyer', phone: '+91 98765 43210' }).expect(201)).body.data;
  return { project, plots, plan, customer };
}

export function bookingBody(inv: Awaited<ReturnType<typeof setupInventory>>, plotIndexes: number[] = [0], extra: object = {}) {
  return {
    projectId: inv.project.id,
    customerId: inv.customer.id,
    plotIds: plotIndexes.map((i) => inv.plots[i]!.id),
    paymentPlanId: inv.plan.id,
    bookingDate: '2026-04-10',
    ...extra,
  };
}
