import { defineConfig, configDefaults } from 'vitest/config';

// The committed test suite lives in lib/ and app/ (*.test.ts). `.scratch/` holds
// gitignored throwaway verification scripts that rely on local-only files and ad-hoc
// setup (a ~/Downloads export, an unconfigured JSX runtime) — they are not part of the
// suite and must not gate `npm test`. Exclude them explicitly, on top of the defaults.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '.scratch/**'],
  },
});
