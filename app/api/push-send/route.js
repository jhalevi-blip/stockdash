import { getSupabaseAdmin } from '@/lib/supabase';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Manual push sender — operator-only. Guarded by a shared secret header.
// POST body: { title, body, url, userId? }. Sends to every stored subscription
// (or just the given user's), and prunes subscriptions that have expired
// (404/410). Returns { sent, failed, removed }.
export async function POST(request) {
  const secret = process.env.PUSH_SEND_SECRET;
  // If the guard secret is not configured, refuse everything.
  if (!secret || request.headers.get('x-push-secret') !== secret) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const subject    = process.env.VAPID_SUBJECT;
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    return Response.json({ error: 'Push not configured' }, { status: 500 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, body: messageBody, url, userId } = body ?? {};
  if (!title) return Response.json({ error: 'Missing title' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Database unavailable' }, { status: 500 });

  let query = sb.from('push_subscriptions').select('endpoint, subscription');
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const payload = JSON.stringify({
    title,
    body: messageBody ?? '',
    url: url ?? '/dashboard',
  });

  let sent = 0;
  let failed = 0;
  const expired = [];

  await Promise.all(
    (data ?? []).map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent += 1;
      } catch (err) {
        failed += 1;
        // 404/410 mean the subscription is gone — mark for pruning.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expired.push(row.endpoint);
        }
      }
    })
  );

  let removed = 0;
  if (expired.length) {
    const { error: delErr, count } = await sb
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .in('endpoint', expired);
    if (!delErr) removed = count ?? expired.length;
  }

  return Response.json({ sent, failed, removed });
}
