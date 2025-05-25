import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.test.mts',
        'src/test-fixtures/',
        'src/mocks/'
      ]
    },
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.mts'
    ],
    exclude: [
      'node_modules/',
      'dist/',
      'src/e2e/**/*'
    ]
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
});