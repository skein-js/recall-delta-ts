import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { name: 'sqlite-integration', include: ['src/**/tests/**/*.integration.spec.ts'] },
});
