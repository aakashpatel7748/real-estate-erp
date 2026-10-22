import type { IncomingMessage, ServerResponse } from 'node:http';

let app: any = null;

async function init() {
  if (!app) {
    const mongoose = (await import('mongoose')).default;
    const { connectDb } = await import('../apps/api/src/config/db');
    const { createApp } = await import('../apps/api/src/app');

    if (mongoose.connection.readyState === 0) {
      await connectDb();
    }
    app = createApp();
  }
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const expressApp = await init();
  return expressApp(req, res);
}
