import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/scripts/seed.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // Bundle the workspace package (it ships TypeScript source); keep real deps external.
  noExternal: ['@erp/shared'],
});
