import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { name: 'warehouse', include: ['src/**/tests/**/*.spec.ts'] },
});
