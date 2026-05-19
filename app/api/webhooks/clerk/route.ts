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

  // Cascade-delete user-keyed rows. Both errors are logged but we
  // still return 200 so Clerk doesn't retry indefinitely — manual
  // cleanup is preferable to retry storms.
  const portfolioResult = await supa
    .from('portfolios')
    .delete()
    .eq('user_id', userId);

  const correlationsResult = await supa
    .from('portfolio_correlations')
    .delete()
    .eq('user_id', userId);

  if (portfolioResult.error) {
    console.error(
      '[clerk-webhook] portfolios delete failed',
      userId,
      portfolioResult.error
    );
  }
  if (correlationsResult.error) {
    console.error(
      '[clerk-webhook] portfolio_correlations delete failed',
      userId,
      correlationsResult.error
    );
  }

  console.log(
    '[clerk-webhook] user.deleted cascade complete',
    userId,
    {
      portfoliosOk: !portfolioResult.error,
      correlationsOk: !correlationsResult.error,
    }
  );

  return NextResponse.json({
    received: true,
    userId,
    portfoliosDeleted: !portfolioResult.error,
    correlationsDeleted: !correlationsResult.error,
  });
}

// Reject other methods explicitly (Clerk only POSTs)
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
