/**
 * API usage tracking — Finnhub (in-memory per-minute) + FMP (Supabase daily).
 *
 * Supabase setup — run once in the SQL editor:
 *
 *   create table if not exists api_usage (
 *     api   text not null,
 *     date  text not null,
 *     count int  not null default 0,
 *     primary key (api, date)
 *   );
 *
 *   create or replace function increment_api_usage(p_api text, p_date text, p_n int default 1)
 *   returns int language sql as $$
 *     insert into api_usage (api, date, count)
 *     values (p_api, p_date, p_n)
 *     on conflict (api, date) do update
 *       set count = api_usage.count + excluded.count
 *     returning count;
 *   $$;
 */

import { getSupabaseAdmin } from './supabase';

// ── Thresholds ────────────────────────────────────────────────────────────────
export const FINNHUB_LIMIT = 60;    // per minute
export const FMP_LIMIT     = 250;   // per day
export const FINNHUB_ALERT = Math.floor(FINNHUB_LIMIT * 0.8); // 48
export const FMP_ALERT     = Math.floor(FMP_LIMIT     * 0.8); // 200

// ── In-memory Finnhub per-minute window (per Vercel instance) ─────────────────
const fhWindow = { count: 0, windowStart: Date.now() };

// ── Alert de-dup (in-memory, best-effort; prevents repeated emails per instance) ──
const alertsSent = new Set<string>();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Public tracking functions ─────────────────────────────────────────────────

/** Call synchronously from any Finnhub API route. Returns current minute count. */
export function trackFinnhub(calls = 1): number {
  const now = Date.now();
  if (now - fhWindow.windowStart > 60_000) {
    fhWindow.count = 0;
    fhWindow.windowStart = now;
  }
  fhWindow.count += calls;
  if (fhWindow.count >= FINNHUB_ALERT) {
    sendAlert('finnhub', fhWindow.count, FINNHUB_LIMIT).catch(() => {});
  }
  return fhWindow.count;
}

/** Fire-and-forget from FMP API routes. Returns new daily count. */
export async function trackFMP(calls = 1): Promise<number> {
  const sb = getSupabaseAdmin();
  if (!sb) return 0;
  try {
    const { data } = await sb.rpc('increment_api_usage', {
      p_api: 'fmp', p_date: todayUTC(), p_n: calls,
    }) as unknown as { data: number | null };
    const count = data ?? 0;
    if (count >= FMP_ALERT) {
      sendAlert('fmp', count, FMP_LIMIT).catch(() => {});
    }
    return count;
  } catch {
    return 0;
  }
}

/** Used by /api/usage to return current counts to the client. */
export async function getUsageCounts(): Promise<{
  finnhub: { count: number; limit: number; alertAt: number };
  fmp:     { count: number; limit: number; alertAt: number; date: string };
}> {
  const sb = getSupabaseAdmin();
  let fmpCount = 0;
  if (sb) {
    try {
      const { data } = await sb
        .from('api_usage')
        .select('count')
        .eq('api', 'fmp')
        .eq('date', todayUTC())
        .single();
      fmpCount = (data as { count: number } | null)?.count ?? 0;
    } catch {}
  }
  return {
    finnhub: { count: fhWindow.count, limit: FINNHUB_LIMIT, alertAt: FINNHUB_ALERT },
    fmp:     { count: fmpCount,       limit: FMP_LIMIT,     alertAt: FMP_ALERT, date: todayUTC() },
  };
}

// ── Email alert via Resend ────────────────────────────────────────────────────

async function sendAlert(api: string, count: number, limit: number): Promise<void> {
  const key = `${api}_${todayUTC()}`;
  if (alertsSent.has(key)) return;
  alertsSent.add(key); // mark before await to prevent concurrent duplicate sends

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return; // skip if not configured

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const pct   = Math.round((count / limit) * 100);
    const unit  = api === 'fmp' ? `${count}/${limit} calls today` : `${count}/${limit} calls this minute`;

    await resend.emails.send({
      // Domain must be verified in Resend dashboard; swap to onboarding@resend.dev for testing
      from: 'alerts@stockdashes.com',
      to:   'jhalevi@gmail.com',
      subject: `⚠️ StockDash: ${api.toUpperCase()} API at ${pct}% capacity`,
      html: `
        <p>Hi,</p>
        <p>The <strong>${api.toUpperCase()}</strong> API on <strong>stockdashes.com</strong> has crossed the 80% alert threshold.</p>
        <p><strong>Current usage:</strong> ${unit} (${pct}%)</p>
        <p>Some data pages may become unavailable if usage continues at this rate.</p>
        <p style="color:#888;font-size:12px">— StockDash automated monitoring · ${new Date().toUTCString()}</p>
      `,
    });
  } catch {
    // Swallow — alert already de-duped above; don't let email failure break routes
  }
}
