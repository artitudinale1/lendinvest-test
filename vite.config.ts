import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { copilotPlugin } from './src/server/viteAdapter';

export default defineConfig({
  base: '/lendinvest-test/',
  plugins: [tailwindcss(), react(), copilotPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
