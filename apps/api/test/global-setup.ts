import { existsSync } from 'node:fs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

let replSet: MongoMemoryReplSet | undefined;

/**
 * Starts a single-node replica set (transactions require one). Set MONGOMS_SYSTEM_BINARY to
 * use a locally installed mongod instead of downloading one, or TEST_MONGODB_URI to use an
 * existing replica set.
 */
export async function setup(project: TestProject) {
  if (process.env.TEST_MONGODB_URI) {
    project.provide('mongoUri', process.env.TEST_MONGODB_URI);
    return;
  }
  if (!process.env.MONGOMS_SYSTEM_BINARY && existsSync('/opt/mongo/bin/mongod')) {
    process.env.MONGOMS_SYSTEM_BINARY = '/opt/mongo/bin/mongod';
  }
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  project.provide('mongoUri', replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
