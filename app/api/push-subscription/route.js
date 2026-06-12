import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Persist (POST) or remove (DELETE) a browser web-push subscription for the
// signed-in user. Subscriptions live in push_subscriptions (endpoint PK);
// see db/migrations/005_push_subscriptions.sql.

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Database unavailable' }, { status: 500 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subscription = body?.subscription;
  // A valid PushSubscription has a string endpoint and a keys object
  // ({ p256dh, auth }). Reject anything that does not.
  if (
    !subscription ||
    typeof subscription.endpoint !== 'string' ||
    typeof subscription.keys !== 'object' ||
    subscription.keys === null
  ) {
    return Response.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const { error } = await sb.from('push_subscriptions').upsert(
    { endpoint: subscription.endpoint, user_id: userId, subscription },
    { onConflict: 'endpoint' },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Database unavailable' }, { status: 500 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const endpoint = body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    return Response.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  // Scope the delete to the user's own rows — a user can only remove their
  // own subscription, never another user's by guessing an endpoint.
  const { error } = await sb
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
