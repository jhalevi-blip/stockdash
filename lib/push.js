import webpush from 'web-push';

// Shared web-push sender used by both /api/push-send and the daily
// portfolio-summary cron. Configures VAPID from env, sends `payload` (a
// pre-serialized JSON string) to every subscription, and prunes any row whose
// endpoint reports gone (404/410).
//
//   subs: [{ endpoint, subscription }]
//   payload: JSON string (e.g. JSON.stringify({ title, body, url }))
//
// Returns { sent, failed, removed }. Callers are responsible for validating
// that the VAPID env vars exist before invoking (so they can return their own
// status code); setVapidDetails here would otherwise throw on missing keys.
export async function sendToSubscriptions({ sb, subs, payload }) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  let sent = 0;
  let failed = 0;
  const expired = [];

  await Promise.all(
    (subs ?? []).map(async (row) => {
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

  return { sent, failed, removed };
}
