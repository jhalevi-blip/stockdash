import { Webhook } from 'svix';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error('[clerk-webhook] CLERK_WEBHOOK_SIGNING_SECRET not set');
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 }
    );
  }

  const headerStore = await headers();
  const svixId        = headerStore.get('svix-id');
  const svixTimestamp = headerStore.get('svix-timestamp');
  const svixSignature = headerStore.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    );
  }

  const body = await req.text();

  let evt: { type: string; data: { id: string } };
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as { type: string; data: { id: string } };
  } catch (err) {
    console.error('[clerk-webhook] signature verification failed', err);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }

  if (evt.type !== 'user.deleted') {
    // Acknowledge but ignore other event types (e.g. user.created,
    // user.updated). Clerk retries on non-2xx so we explicitly
    // return 200 to mark them processed.
    return NextResponse.json({ received: true, ignored: evt.type });
  }

  const userId = evt.data?.id;
  if (!userId) {
    console.error('[clerk-webhook] user.deleted event missing user id');
    return NextResponse.json(
      { error: 'Event missing user id' },
      { status: 400 }
    );
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    console.error('[clerk-webhook] Supabase admin client unavailable — check SUPABASE_SECRET_KEY env var');
    return NextResponse.json(
      { error: 'Supabase admin unavailable' },
      { status: 500 }
    );
  }

  // Cascade-delete every user-keyed row across all five tables. A delete that
  // matches nothing is not an error, so missing rows are tolerated. Failures are
  // isolated — one table erroring must not stop the others — and collected for
  // logging. Signature verification already passed, so we always return 200:
  // manual cleanup of a failed table beats Clerk retry storms.
  const USER_TABLES = [
    'portfolios',
    'portfolio_transactions',
    'portfolio_correlations',
    'user_settings',
    'theme_classifications',
    'theme_candidates',
    'push_subscriptions',
  ] as const;

  const results = await Promise.all(
    USER_TABLES.map(async (table) => {
      const { count, error } = await supa
        .from(table)
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      if (error) {
        console.error(`[clerk-webhook] ${table} delete failed`, userId, error);
      }
      return { table, deleted: count ?? 0, error: error?.message ?? null };
    })
  );

  const deletedByTable = Object.fromEntries(results.map((r) => [r.table, r.deleted]));
  const failedTables = results.filter((r) => r.error).map((r) => r.table);

  console.log('[clerk-webhook] user.deleted cascade complete', userId, {
    deletedByTable,
    failedTables,
  });

  return NextResponse.json({
    received: true,
    userId,
    deletedByTable,
    failedTables,
  });
}

// Reject other methods explicitly (Clerk only POSTs)
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
