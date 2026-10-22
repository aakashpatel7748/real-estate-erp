import mongoose, { type ClientSession } from 'mongoose';

/**
 * Run `fn` inside a MongoDB transaction with majority write concern and snapshot reads.
 * `withTransaction` retries on TransientTransactionError / UnknownTransactionCommitResult,
 * so `fn` must be safe to re-run (no external side effects inside it).
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      },
    );
    return result;
  } finally {
    await session.endSession();
  }
}
