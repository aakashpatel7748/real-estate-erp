import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/app.ts', 'src/config/db.ts', 'src/scripts/seed.ts', 'src/scripts/sync-indexes.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // Bundle the workspace package (it ships TypeScript source); keep real deps external.
  noExternal: ['@erp/shared'],
});
