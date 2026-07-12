import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/integration/**'],

    setupFiles: ['./tests/setup.ts'],

    testTimeout: 10_000,
    hookTimeout: 10_000,

    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },

    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: {
      junit: './coverage/junit.xml',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/index.ts',
        'src/types/**',
        'src/container.ts',
        'tests/**',
        'node_modules/**',
        'dist/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
        autoUpdate: false,
      },
      all: true,
      clean: true,
    },
  },

  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
// vite.config.js
import { defineConfig } from "vite";
import { codecovVitePlugin } from "@codecov/vite-plugin";

export default defineConfig({
  plugins: [
    // Put the Codecov vite plugin after all other plugins
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: "<bundle project name>",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
});
