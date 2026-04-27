import { defineConfig } from 'vitest/config';
import process from 'process';

// In CI, use faster timeout and aggressive reporter settings
const isCI = process.env.CI === 'true';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: isCI ? 60000 : 30000, // Longer timeout in CI (RPC calls can be slow)
    hookTimeout: isCI ? 30000 : 10000, // Timeout for beforeEach/afterEach
    bail: isCI ? 1 : undefined, // Fail fast on first error in CI
    reporters: isCI ? ['verbose'] : ['default'], // Verbose output in CI for debugging
    // Attempt to diagnose hangs
    isolate: true, // Run each test file in isolation
  },
});
