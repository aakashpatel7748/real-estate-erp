import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import mongoose from 'mongoose';
import { env } from './config/env';
import './models';
import { authenticate, tenant } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter, requestId } from './middleware/security';
import { accountingRouter } from './modules/accounting/accounting.routes';
import { adminRouter } from './modules/admin.routes';
import { authRouter } from './modules/auth/auth.routes';
import { projectsRouter } from './modules/projects/projects.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { bookingsRouter, brokersRouter, customersRouter, paymentsRouter, plansRouter } from './modules/sales.routes';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
      exposedHeaders: ['x-request-id', 'idempotent-replayed', 'content-disposition'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ success: dbUp, data: { status: dbUp ? 'ok' : 'degraded', db: dbUp } });
  });

  const v1 = Router();
  v1.use(apiLimiter);
  v1.use('/auth', authRouter);

  // Everything below requires an authenticated session and a verified tenant context.
  const tenantScoped = Router();
  tenantScoped.use(authenticate, tenant);
  tenantScoped.use('/projects', projectsRouter);
  tenantScoped.use('/customers', customersRouter);
  tenantScoped.use('/brokers', brokersRouter);
  tenantScoped.use('/payment-plans', plansRouter);
  tenantScoped.use('/bookings', bookingsRouter);
  tenantScoped.use('/payments', paymentsRouter);
  tenantScoped.use('/accounting', accountingRouter);
  tenantScoped.use('/', reportsRouter);
  tenantScoped.use('/', adminRouter);
  v1.use(tenantScoped);

  app.use('/api/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
