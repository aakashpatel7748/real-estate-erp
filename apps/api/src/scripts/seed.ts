/**
 * Development seed. Creates a demo company with a project, blocks, plots laid out on the
 * map, payment plans, customers, bookings and receipts — all through the real services, so
 * the books, ledgers and dashboard are consistent.
 *
 * Seed accounts are flagged `isDevSeed`; the API refuses to start in production while any
 * of them is active. Usage: `npm run seed` (add `-- --reset` to wipe the database first).
 */
import mongoose, { Types } from 'mongoose';
import { addDays, addMonths, sqftToAreaX100, SYSTEM_ROLES, todayInIndia } from '@erp/shared';
import { connectDb } from '../config/db';
import { env } from '../config/env';
import '../models';
import { withTransaction } from '../db/transaction';
import { createCompanyWithDefaults } from '../modules/companies/company.service';
import { hashPassword } from '../modules/auth/password';
import { Membership, User } from '../modules/users/user.models';
import { Role } from '../modules/roles/role.models';
import { Permission } from '../modules/roles/role.models';
import { ALL_PERMISSIONS, PERMISSION_LABELS } from '@erp/shared';
import { Project } from '../modules/projects/project.models';
import * as projects from '../modules/projects/projects.service';
import * as plots from '../modules/plots/plots.service';
import * as plans from '../modules/bookings/payment-plans.service';
import * as customers from '../modules/customers/customers.service';
import * as bookings from '../modules/bookings/bookings.service';
import * as payments from '../modules/payments/payments.service';
import type { TenantContext } from '../utils/tenant';

/** Service results are toJSON()-ed documents (with `id`), lean ones have `_id`. */
const idOf = (d: unknown) => String((d as { id?: unknown }).id ?? (d as { _id?: unknown })._id);

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@demo.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'DemoAdmin@2026';

async function main() {
  if (env.isProd) throw new Error('Refusing to seed a production database');
  await connectDb();
  if (process.argv.includes('--reset')) {
    await mongoose.connection.db!.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    console.log('Database reset');
  }

  await Permission.bulkWrite(
    ALL_PERMISSIONS.map((key) => {
      const [group, action] = key.split('.') as [string, string];
      return {
        updateOne: {
          filter: { key },
          update: { $set: { key, group, action, label: `${PERMISSION_LABELS[group]}: ${action}` } },
          upsert: true,
        },
      };
    }),
  );

  if (await User.exists({ email: ADMIN_EMAIL })) {
    console.log(`Seed user ${ADMIN_EMAIL} already exists; skipping. Use --reset to start over.`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const { admin, company } = await withTransaction(async (session) => {
    const [admin] = await User.create(
      [{ name: 'Demo Admin', email: ADMIN_EMAIL, passwordHash, emailVerifiedAt: new Date(), isDevSeed: true }],
      { session },
    );
    const company = await createCompanyWithDefaults({ name: 'Sunrise Colonizers (Demo)', ownerUserId: admin!._id }, session);
    return { admin: admin!, company };
  });

  // A second, restricted user to demonstrate project-level access.
  const salesRole = await Role.findOne({ companyId: company._id, systemKey: 'sales' }).lean();
  const [salesUser] = await User.create([
    {
      name: 'Demo Sales',
      email: 'sales@demo.local',
      passwordHash: await hashPassword('DemoSales@2026'),
      emailVerifiedAt: new Date(),
      isDevSeed: true,
    },
  ]);

  const ctx: TenantContext = {
    userId: admin._id,
    companyId: company._id,
    roleId: new Types.ObjectId(),
    permissions: new Set(SYSTEM_ROLES.owner!.permissions),
    projectScope: null,
    meta: { requestId: 'seed' },
  };

  const project = await projects.createProject(ctx, {
    name: 'Green Valley Enclave',
    code: 'GVE',
    status: 'active',
    description: 'Gated residential plotted development with parks and wide internal roads.',
    address: { line1: 'Kolar Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462042' },
    reraNumber: 'P-BPL-26-0000 (demo)',
    defaultRatePaisePerSqft: 2_200_00,
  });
  const projectId = idOf(project);
  await Membership.create({
    companyId: company._id,
    userId: salesUser!._id,
    roleId: salesRole!._id,
    status: 'active',
    projectAccess: { mode: 'restricted', projectIds: [new Types.ObjectId(idOf(project))] },
  });
  await projects.createProject(ctx, { name: 'Lakeview Residency', code: 'LVR', status: 'planning' });

  const phase = await projects.createPhase(ctx, projectId, { name: 'Phase 1', code: 'P1', sequence: 1 });
  const blockA = await projects.createBlock(ctx, projectId, { name: 'Block A', code: 'A', phaseId: idOf(phase) });
  const blockB = await projects.createBlock(ctx, projectId, { name: 'Block B', code: 'B', phaseId: idOf(phase) });

  // Lay out plots as a grid on a 1200×800 map: two blocks separated by a road.
  const created: { id: string; number: string }[] = [];
  const blocks = [
    { block: blockA, x0: 60, label: 'A' },
    { block: blockB, x0: 640, label: 'B' },
  ];
  for (const { block, x0 } of blocks) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const n = row * 6 + col + 1;
        const w = 80;
        const h = 150;
        const x = x0 + col * (w + 4);
        const y = 60 + row * (h + (row === 1 ? 70 : 10));
        const corner = col === 0 || col === 5;
        const plot = await plots.createPlot(ctx, projectId, {
          blockId: idOf(block),
          plotNumber: String(n),
          category: 'residential',
          facing: row % 2 === 0 ? 'north' : 'south',
          areaX100: sqftToAreaX100(corner ? '1500' : '1200'),
          ratePaisePerSqft: 2_200_00,
          plcBp: corner ? 500 : 0,
          isCorner: corner,
          mapShape: { points: `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}` },
        });
        created.push({ id: idOf(plot), number: `${block.code}-${n}` });
      }
    }
  }
  await Project.updateOne(
    { companyId: company._id, _id: new Types.ObjectId(idOf(project)) },
    { $set: { map: { width: 1200, height: 800, backgroundColor: '#f1f5f9' } } },
  );

  const standard = await plans.createPlan(ctx, {
    name: 'Standard 10-30-60',
    description: '10% on booking, 30% in 30 days, 60% at registry (6 months)',
    isActive: true,
    rules: [
      { type: 'percent', name: 'Booking amount', valueBp: 1_000, due: { kind: 'on_booking' } },
      { type: 'percent', name: 'Agreement', valueBp: 3_000, due: { kind: 'days_after_booking', days: 30 } },
      { type: 'percent', name: 'Registry', valueBp: 6_000, due: { kind: 'months_after_booking', months: 6 } },
    ],
  });
  const emi = await plans.createPlan(ctx, {
    name: 'Token + 12 EMIs',
    description: '₹51,000 token, balance in 12 monthly installments',
    isActive: true,
    rules: [
      { type: 'fixed', name: 'Token', amountPaise: 51_000_00, due: { kind: 'on_booking' } },
      { type: 'balance', name: 'EMI', due: { kind: 'months_after_booking', months: 1 }, repeat: { count: 12, everyMonths: 1 } },
    ],
  });

  const people = [
    { name: 'Rakesh Sharma', phone: '+91 98260 11111', pan: 'ABCPS1234K' },
    { name: 'Priya Verma', phone: '+91 98930 22222' },
    { name: 'Imran Khan', phone: '+91 94250 33333' },
    { name: 'Sunita Patel', phone: '+91 97520 44444' },
    { name: 'Arjun Mehta', phone: '+91 99770 55555' },
  ];
  const custs = [];
  for (const p of people)
    custs.push(await customers.createCustomer(ctx, { ...p, coApplicants: [], address: { city: 'Bhopal', state: 'Madhya Pradesh' } }));

  const today = todayInIndia();
  const scenarios = [
    { cust: 0, plots: [0], plan: standard, date: addMonths(today, -7), pay: 'all' },
    { cust: 1, plots: [1], plan: standard, date: addMonths(today, -3), pay: 'two' },
    { cust: 2, plots: [7, 8], plan: emi, date: addMonths(today, -5), pay: 'some' },
    { cust: 3, plots: [26], plan: standard, date: addDays(today, -10), pay: 'first' },
    { cust: 4, plots: [30], plan: emi, date: today, pay: 'none', reserve: true },
  ] as const;

  for (const s of scenarios) {
    const booking = await bookings.createBooking(ctx, {
      projectId,
      customerId: idOf(custs[s.cust]!),
      plotIds: s.plots.map((i) => created[i]!.id),
      paymentPlanId: idOf(s.plan),
      bookingDate: s.date,
      mode: 'reserve' in s && s.reserve ? 'reserve' : 'book',
      discountPaise: 0,
      charges: s.cust === 0 ? [{ name: 'Development charges', amountPaise: 50_000_00 }] : [],
    });
    const detail = await bookings.getBooking(ctx, idOf(booking));
    const toPay =
      s.pay === 'all'
        ? detail.installments
        : s.pay === 'two'
          ? detail.installments.slice(0, 2)
          : s.pay === 'some'
            ? detail.installments.slice(0, 4)
            : s.pay === 'first'
              ? detail.installments.slice(0, 1)
              : [];
    for (const inst of toPay) {
      const due = inst.dueDate.toISOString().slice(0, 10);
      await payments.recordPayment(ctx, {
        bookingId: idOf(booking),
        amountPaise: inst.amountPaise,
        mode: inst.sequence % 2 ? 'neft' : 'upi',
        receivedOn: due > today ? today : due,
        reference: `UTR${Math.floor(Math.random() * 1e9)}`,
      });
    }
  }
  await plots.changePlotStatus(ctx, projectId, created[0]!.id, 'sold', 'Registry completed');
  await plots.changePlotStatus(ctx, projectId, created[47]!.id, 'blocked', 'Reserved for management quota');

  console.log('\nSeed complete.');
  console.log(`  Owner:  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('  Sales:  sales@demo.local / DemoSales@2026 (restricted to Green Valley Enclave)\n');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
