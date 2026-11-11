import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    name: 'sqlite',
    include: ['src/**/tests/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts'],
  },
});
