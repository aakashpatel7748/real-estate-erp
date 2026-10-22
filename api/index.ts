import type { IncomingMessage, ServerResponse } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../apps/api/src/app';
import { connectDb } from '../apps/api/src/config/db';

let app: any = null;

async function init() {
  if (mongoose.connection.readyState === 0) {
    await connectDb();
  }
  if (!app) {
    app = createApp();
  }
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const expressApp = await init();
  return expressApp(req, res);
}
