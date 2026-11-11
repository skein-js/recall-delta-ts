import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    name: 'core',
    include: ['src/**/tests/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts'],
  },
});
