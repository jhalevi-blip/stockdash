// Hard guard: every test-user script imports assertDevEnv() and calls it FIRST,
// before opening any Supabase/Clerk client. It refuses to run against production.
//
// The allow-list is positive (must match the known DEV identifiers) AND the
// deny-list is explicit (known PROD identifiers). Anything unrecognised is also
// refused — fail closed, never fail open.
//
//   DEV  Supabase project ref : ffxjetrmwhlltkrqxybp
//   PROD Supabase project ref : uvrqpjfzogdqfjawgvxh   ← never touch
//   DEV  Clerk keys           : pk_test_… / sk_test_…
//   PROD Clerk keys           : pk_live_… / sk_live_…  ← never touch

const DEV_SUPABASE_REF  = 'ffxjetrmwhlltkrqxybp';
const PROD_SUPABASE_REF = 'uvrqpjfzogdqfjawgvxh';

function die(msg) {
  console.error(`\n✖ SAFETY GUARD: ${msg}\n  Refusing to run. These scripts are DEV-only.\n`);
  process.exit(1);
}

/**
 * Assert the process env points at the DEV Supabase + DEV Clerk instance.
 * @param {object} [opts]
 * @param {boolean} [opts.supabase=true] require a valid DEV Supabase config
 * @param {boolean} [opts.clerk=true]    require a valid DEV Clerk config
 */
export function assertDevEnv({ supabase = true, clerk = true } = {}) {
  if (supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const secret = process.env.SUPABASE_SECRET_KEY || '';
    if (url.includes(PROD_SUPABASE_REF)) die(`Supabase URL is the PRODUCTION project (${PROD_SUPABASE_REF}).`);
    if (!url.includes(DEV_SUPABASE_REF))  die(`Supabase URL is not the known DEV project (expected ${DEV_SUPABASE_REF}, got "${url || '(empty)'}").`);
    if (!secret)                          die('SUPABASE_SECRET_KEY is missing — run with `node --env-file=.env.local`.');
    if (!secret.startsWith('sb_secret'))  die('SUPABASE_SECRET_KEY does not look like a Supabase secret key.');
  }

  if (clerk) {
    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
    const sk = process.env.CLERK_SECRET_KEY || '';
    if (pk.startsWith('pk_live') || sk.startsWith('sk_live')) die('Clerk keys are LIVE (production).');
    if (!pk.startsWith('pk_test')) die(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not a test key (got "${pk.slice(0, 12)}…").`);
    if (!sk.startsWith('sk_test')) die('CLERK_SECRET_KEY is not a test key.');
  }

  return true;
}

export { DEV_SUPABASE_REF, PROD_SUPABASE_REF };
