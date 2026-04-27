/**
 * Vitest configuration.
 *
 * Pure Node tests for V0 — no jsdom/happy-dom because we don't yet test
 * components. Add `environment: 'jsdom'` once we ship hooks/components that
 * need a DOM.
 *
 * Refs:
 *   https://vitest.dev/config/
 */

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['lib/**/*.{test,spec}.ts', 'lib/**/__tests__/**/*.ts'],
    exclude: ['node_modules', '.next', 'dist'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/__tests__/**', 'lib/**/*.spec.ts', 'lib/**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
