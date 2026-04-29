import { getSupabaseAdmin } from './supabase';

const TABLE = 'portfolio_correlations';

/**
 * Fetch the most recent correlation row for a user.
 * Returns null if no row exists. Throws on Supabase error.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getMostRecentCorrelation(userId) {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin client not available');

  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/**
 * Insert a new correlation row for a user and delete all older rows,
 * keeping only the most recent. Returns the inserted row.
 *
 * The table schema is history-capable (composite PK user_id + computed_at),
 * but we prune to one row per user until history is needed.
 *
 * @param {string} userId
 * @param {{
 *   holdings_fingerprint: string,
 *   tickers: string[],
 *   matrix: number[][],
 *   aligned_date_start: string,
 *   aligned_date_end: string,
 *   trading_days_used: number,
 *   failed_tickers: string[],
 * }} correlationData
 * @returns {Promise<object>} inserted row
 */
export async function saveCorrelation(userId, correlationData) {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin client not available');

  const { data: inserted, error: insertError } = await sb
    .from(TABLE)
    .insert({
      user_id:              userId,
      holdings_fingerprint: correlationData.holdings_fingerprint,
      tickers:              correlationData.tickers,
      matrix:               correlationData.matrix,
      aligned_date_start:   correlationData.aligned_date_start,
      aligned_date_end:     correlationData.aligned_date_end,
      trading_days_used:    correlationData.trading_days_used,
      failed_tickers:       correlationData.failed_tickers ?? [],
    })
    .select()
    .single();

  if (insertError) throw insertError;

  // Prune all rows older than the one we just inserted
  const { error: deleteError } = await sb
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .lt('computed_at', inserted.computed_at);

  if (deleteError) {
    // Non-fatal — insert succeeded; log and continue
    console.warn('[correlationStore] pruning old rows failed:', deleteError.message);
  }

  return inserted;
}

/**
 * Returns true if the cached correlation row is absent, stale by age,
 * or computed against a different portfolio.
 *
 * Pure function — no side effects.
 *
 * @param {object|null} row         — row from getMostRecentCorrelation
 * @param {string} currentFingerprint — from computeHoldingsFingerprint
 * @param {number} [maxAgeHours=24]
 * @returns {boolean}
 */
export function isStale(row, currentFingerprint, maxAgeHours = 24) {
  if (!row) return true;
  if (row.holdings_fingerprint !== currentFingerprint) return true;
  const ageHours = (Date.now() - new Date(row.computed_at).getTime()) / (1000 * 60 * 60);
  return ageHours > maxAgeHours;
}
