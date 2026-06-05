import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchDailyCloses } from '@/lib/fmpHistory';
import { ENGINE_VERSION, HISTORY_YEARS, TRACKERS, TRACKERS_BY_THESIS } from '@/app/(v2)/themes/_lib/trackers';
import { trackerTemperature, thesisTemperature } from '@/app/(v2)/themes/_lib/temperature';

// Global market-temperature snapshot for /themes. NOT user data — no auth. Served from a
// single theme_temperatures row, recomputed at most once a day.
export const dynamic = 'force-dynamic';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  // 1. Serve a fresh (< 24h) snapshot if we have one.
  try {
    const { data } = await sb
      .from('theme_temperatures')
      .select('payload, computed_at')
      .eq('engine_version', ENGINE_VERSION)
      .maybeSingle();

    if (data?.payload && data.computed_at) {
      const age = Date.now() - new Date(data.computed_at).getTime();
      if (age < MAX_AGE_MS) {
        return Response.json({ payload: data.payload }, NO_STORE);
      }
    }
  } catch (err) {
    console.error('[theme-temperatures] cache read failed, recomputing:', err);
  }

  // 2. Recompute. Gather every unique symbol referenced by the trackers.
  const symbolSet = new Set();
  for (const cfg of TRACKERS) {
    if (cfg.single) symbolSet.add(cfg.single);
    (cfg.num ?? []).forEach(s => symbolSet.add(s));
    (cfg.den ?? []).forEach(s => symbolSet.add(s));
  }

  const { seriesBySymbol, failedSymbols } = await fetchDailyCloses([...symbolSet], HISTORY_YEARS);

  // Only fail hard when nothing at all came back.
  if (!Object.keys(seriesBySymbol).length) {
    return Response.json(
      { error: 'All symbol fetches failed', failedSymbols },
      { status: 502, ...NO_STORE },
    );
  }

  const notes = [];
  if (failedSymbols.length) notes.push(`Missing price data for: ${failedSymbols.join(', ')}`);

  // 3. Per-thesis → per-tracker temperatures. Per-tracker errors/notes degrade gracefully.
  const theses = {};
  for (const [thesisId, cfgs] of Object.entries(TRACKERS_BY_THESIS)) {
    const trackerResults = cfgs.map(cfg => trackerTemperature(seriesBySymbol, cfg));
    for (const t of trackerResults) {
      if (t.error) notes.push(`${t.id}: ${t.error}`);
      else if (t.note) notes.push(`${t.id}: ${t.note}`);
    }
    const rollup = thesisTemperature(trackerResults);
    theses[thesisId] = {
      temperature: rollup.temperature,
      score: rollup.score,
      trackers: trackerResults,
    };
  }

  const computedAt = new Date().toISOString();
  const payload = {
    engineVersion: ENGINE_VERSION,
    computedAt,
    theses,
    failedSymbols,
    notes,
  };

  // 4. Persist the snapshot (best-effort; still return the payload either way).
  try {
    const { error } = await sb.from('theme_temperatures').upsert(
      { engine_version: ENGINE_VERSION, computed_at: computedAt, payload },
      { onConflict: 'engine_version' },
    );
    if (error) console.error('[theme-temperatures] upsert failed:', error.message);
  } catch (err) {
    console.error('[theme-temperatures] upsert threw:', err);
  }

  return Response.json({ payload }, NO_STORE);
}
