import { createApp } from './app';
import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { startJobs, stopJobs } from './jobs';
import { logger } from './utils/logger';
import { User } from './modules/users/user.models';

async function main() {
  await connectDb();
  if (env.isProd && (await User.exists({ isDevSeed: true, isActive: true }))) {
    throw new Error('Development seed accounts are active. Disable or remove them before running in production.');
  }
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));
  startJobs();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopJobs();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
