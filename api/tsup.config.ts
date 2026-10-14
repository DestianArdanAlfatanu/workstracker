import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // @wt/shared berisi source TS, jadi ikut di-bundle.
  noExternal: ['@wt/shared'],
});
