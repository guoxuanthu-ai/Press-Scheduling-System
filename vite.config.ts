import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@contracts': path.resolve(__dirname, 'contracts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/trpc': 'http://localhost:3001',
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'node',
    include: ['api/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
