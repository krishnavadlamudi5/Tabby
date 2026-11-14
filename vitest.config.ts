import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    env: {
      JWT_SECRET: 'test-secret-do-not-use-in-production',
      NODE_ENV: 'test',
      // 32 zero bytes, base64 - test-only key
      DATA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      RATE_LIMIT_MAX: '100000',
    },
  },
});
