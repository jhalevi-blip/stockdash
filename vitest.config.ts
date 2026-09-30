import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The committed test suite lives in lib/ and app/ (*.test.ts). `.scratch/` holds
// gitignored throwaway verification scripts that rely on local-only files and ad-hoc
// setup (a ~/Downloads export, an unconfigured JSX runtime) — they are not part of the
// suite and must not gate `npm test`. Exclude them explicitly, on top of the defaults.
export default defineConfig({
  // Mirror the Next.js "@/*" → project-root path alias so tests can import source
  // modules that use it (e.g. positionValue.js → '@/lib/quoteCurrency').
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    exclude: [...configDefaults.exclude, '.scratch/**'],
  },
});
