/**
 * Builds/updates all MongoDB indexes. Production runs with autoIndex off, so run this in
 * every release job:  node apps/api/dist/scripts/sync-indexes.js
 */
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import '../models';

async function main() {
  await connectDb();
  for (const model of Object.values(mongoose.models)) {
    const dropped = await model.syncIndexes();
    console.log(`${model.modelName}: indexes in sync${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
