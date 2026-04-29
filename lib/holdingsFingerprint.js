import { createHash } from 'crypto';

/**
 * Compute a stable 16-char hex fingerprint for a holdings array.
 * Used to detect whether the portfolio has changed since the last correlation compute.
 *
 * Algorithm:
 *   1. Filter out __CASH__ entries (correlation is stocks-only)
 *   2. Sort remaining holdings alphabetically by ticker
 *   3. Serialize as "TICKER:shares|TICKER:shares|..."
 *      Cost basis (c) is intentionally excluded — correlation depends on which
 *      stocks are held and how many shares, not what they cost
 *   4. SHA-256 hash, truncated to the first 16 hex chars
 *
 * @param {Array<{t: string, s: number, c: number}>} holdings
 * @returns {string} 16-char hex digest
 */
export function computeHoldingsFingerprint(holdings) {
  const stocks = (holdings ?? [])
    .filter(h => h?.t && h.t !== '__CASH__')
    .sort((a, b) => a.t.localeCompare(b.t));

  const str = stocks.map(h => `${h.t}:${h.s}`).join('|');
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}
