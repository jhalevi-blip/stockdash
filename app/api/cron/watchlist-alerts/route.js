import { getSupabaseAdmin } from '@/lib/supabase';
import { getQuotesForGroup } from '@/lib/watchlist/quotes';
import { decideAlert } from '@/lib/watchlist/alerts';
import { getMarketStatus } from '@/lib/marketStatus';
import { trackFMP } from '@/lib/apiUsage';
import { sendEmail } from '@/lib/email';

// Target-cross price alerts (spec §8). Every 15 min during the US session, compare
// live FMP quotes against watchlist_items.target_price for role='candidate' rows,
// and email the owner when price crosses AT OR BELOW target. price_alerts is the
// dedup ledger: `active` is the armed flag, so a fired alert doesn't re-email every
// 15 min — it re-arms only when price recovers above target.
//
// Scoped to a single owner (OWNER_USER_ID) so one person's targets are never mailed
// to another. Auth: Authorization: Bearer ${CRON_SECRET}, matching cron/portfolio-summary.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DIRECTION = 'below';

function fmtUsd(n) {
  return n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildEmail(crossings, when) {
  const rows = crossings.map(c => {
    const belowPct = ((c.target - c.price) / c.target) * 100;
    return `<tr>
      <td style="padding:6px 12px;font-weight:600">${c.displaySymbol}</td>
      <td style="padding:6px 12px;text-align:right">${fmtUsd(c.price)}</td>
      <td style="padding:6px 12px;text-align:right">${fmtUsd(c.target)}</td>
      <td style="padding:6px 12px;text-align:right;color:#16a34a">${belowPct >= 0 ? '' : '+'}${belowPct.toFixed(1)}% below</td>
    </tr>`;
  }).join('');

  const html = `
    <p>These watchlist candidates have crossed at or below your target price:</p>
    <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px">
      <thead>
        <tr style="border-bottom:1px solid #ddd;color:#666;text-align:left">
          <th style="padding:6px 12px">Symbol</th>
          <th style="padding:6px 12px;text-align:right">Price</th>
          <th style="padding:6px 12px;text-align:right">Target</th>
          <th style="padding:6px 12px;text-align:right">Distance</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#888;font-size:12px">— StockDashes watchlist alerts · ${when}</p>`;

  const subject = crossings.length === 1
    ? `🎯 ${crossings[0].displaySymbol} hit your target (${fmtUsd(crossings[0].price)} ≤ ${fmtUsd(crossings[0].target)})`
    : `🎯 ${crossings.length} watchlist candidates hit target`;

  return { subject, html };
}

export async function GET(request) {
  // ── Auth: Vercel-injected (or manual) bearer ───────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Only during the US regular session (spec §8) ────────────────────────────
  const { isOpen } = getMarketStatus();
  if (!isOpen) return Response.json({ skipped: 'market_closed' });

  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) {
    console.error('[watchlist-alerts] OWNER_USER_ID not configured — nothing to check');
    return Response.json({ skipped: 'no_owner_configured' });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Database unavailable' }, { status: 500 });

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });

  // ── Candidate rows with a target, that we can actually quote ────────────────
  const { data: items, error: itemErr } = await sb
    .from('watchlist_items')
    .select('id, display_symbol, provider_symbol, target_price')
    .eq('user_id', ownerId)
    .eq('role', 'candidate')
    .eq('resolved', true)
    .is('deleted_at', null)
    .not('target_price', 'is', null)
    .not('provider_symbol', 'is', null);
  if (itemErr) return Response.json({ error: `Failed to load items: ${itemErr.message}` }, { status: 500 });

  const summary = { checked: items?.length ?? 0, crossed: 0, emailed: 0, rearmed: 0, errors: [] };
  if (!items?.length) return Response.json({ ...summary, skipped: 'no_targets' });

  // ── Live quotes (FMP), one per distinct symbol behind the 60s cache ─────────
  const symbols = [...new Set(items.map(i => i.provider_symbol))];
  const { quotes, upstreamCalls } = await getQuotesForGroup(symbols, { fmpKey, label: 'watchlist-alerts' });
  if (upstreamCalls > 0) trackFMP(upstreamCalls).catch(() => {});

  // ── Existing alert ledger for these items ───────────────────────────────────
  const itemIds = items.map(i => i.id);
  const { data: alertRows, error: alertErr } = await sb
    .from('price_alerts')
    .select('item_id, active')
    .eq('user_id', ownerId)
    .eq('direction', DIRECTION)
    .in('item_id', itemIds);
  if (alertErr) return Response.json({ error: `Failed to load alerts: ${alertErr.message}` }, { status: 500 });
  const alertByItem = new Map((alertRows ?? []).map(a => [a.item_id, a]));

  const crossings = [];   // newly-fired this run (armed → at/below target)
  const rearm = [];       // recovered above target while disarmed

  for (const it of items) {
    const q = quotes[it.provider_symbol];
    if (!q || q.error || q.price == null) {
      // A missing/failed quote is surfaced, never treated as "no cross".
      if (q?.error) summary.errors.push(`${it.display_symbol}: quote ${q.error}`);
      continue;
    }
    const price = q.price;
    const target = Number(it.target_price);
    const existing = alertByItem.get(it.id);
    const decision = decideAlert({ price, target, active: existing ? existing.active : undefined });

    if (decision === 'fire') crossings.push({ itemId: it.id, displaySymbol: it.display_symbol, price, target });
    else if (decision === 'rearm') rearm.push(it.id);
    // 'quiet' → nothing (armed & above target, or the dedup case: fired & still below)
  }

  // ── Re-arm first (independent of email) ─────────────────────────────────────
  for (const itemId of rearm) {
    const { error } = await sb
      .from('price_alerts')
      .update({ active: true })
      .eq('item_id', itemId)
      .eq('direction', DIRECTION);
    if (error) summary.errors.push(`rearm ${itemId}: ${error.message}`);
    else summary.rearmed += 1;
  }
  summary.crossed = crossings.length;

  // ── Email + disarm. Only disarm AFTER a successful send, so a failed email is
  // retried next run rather than silently lost. ───────────────────────────────
  if (crossings.length) {
    const when = new Date().toUTCString();
    const { subject, html } = buildEmail(crossings, when);
    const to = process.env.ALERT_EMAIL || 'jhalevi@gmail.com';
    const sent = await sendEmail({ to, subject, html, label: 'watchlist-alerts' });

    if (!sent.ok) {
      summary.errors.push(`email: ${sent.error}`);
      return Response.json({ ...summary, emailed: 0 }, { status: 502 });
    }
    summary.emailed = crossings.length;

    for (const c of crossings) {
      const { error } = await sb
        .from('price_alerts')
        .upsert(
          {
            user_id: ownerId,
            item_id: c.itemId,
            direction: DIRECTION,
            price: c.target,
            active: false,             // disarm until price recovers above target
            triggered_at: new Date().toISOString(),
          },
          { onConflict: 'item_id,direction' },
        );
      if (error) summary.errors.push(`disarm ${c.displaySymbol}: ${error.message}`);
    }
  }

  return Response.json(summary);
}
