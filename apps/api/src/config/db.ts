import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { env } from './env';

mongoose.set('strictQuery', true);
// Never let Mongoose build indexes implicitly in production; run `syncIndexes` during deploy.
mongoose.set('autoIndex', !env.isProd);

export async function connectDb(uri = env.MONGODB_URI): Promise<typeof mongoose> {
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  await assertTransactionsSupported();
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  return conn;
}

/** Multi-document transactions require a replica set or sharded cluster. Fail fast otherwise. */
export async function assertTransactionsSupported(): Promise<void> {
  const admin = mongoose.connection.db!.admin();
  const hello = await admin.command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error('MongoDB must run as a replica set (or sharded cluster) to support transactions. See docs/deployment.md.');
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
