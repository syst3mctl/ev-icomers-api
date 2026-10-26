import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'fatal',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    },
  },
});
