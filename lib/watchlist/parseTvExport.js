// Parser for a TradingView watchlist export (build-order step 1, spec §2).
//
// TradingView exports a watchlist as a text file of `EXCHANGE:SYMBOL` tokens with
// section headers on their own `###Name` markers. The exact layout varies by
// export path (some are one comma-separated line, some are newline-separated), so
// this parser is deliberately tolerant of BOTH: it splits on commas AND newlines.
//
// ⚠️ VERIFY against your real export before trusting a large import — the spec
// explicitly warns not to build against an assumed shape. `scripts/watchlist.sample.tv.txt`
// documents the format this was written for.

// Broker/data-vendor exchange prefixes TradingView uses for FX rows.
const FX_EXCHANGE_PREFIXES = new Set([
  'FX', 'FX_IDC', 'OANDA', 'FOREXCOM', 'FXCM', 'SAXO', 'PEPPERSTONE',
  'CURRENCYCOM', 'ICMARKETS', 'BLACKBULL', 'CAPITALCOM',
]);

// ISO-4217 codes common enough to appear in a personal FX watchlist. Used only to
// recognise a bare 6-letter pair (e.g. 'GBPUSD') as FX when there's no FX prefix.
const CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'CNY', 'CNH', 'HKD',
  'SGD', 'SEK', 'NOK', 'DKK', 'MXN', 'ZAR', 'TRY', 'PLN', 'INR', 'KRW', 'BRL',
  'THB', 'ILS', 'CZK', 'HUF', 'RUB',
]);

export function isCurrencyPair(symbol) {
  return /^[A-Z]{6}$/.test(symbol)
    && CURRENCIES.has(symbol.slice(0, 3))
    && CURRENCIES.has(symbol.slice(3));
}

// Default role by section name (spec §2 step 4). Corrected by hand afterwards.
export function sectionRole(name) {
  const n = name.toLowerCase();
  if (/forex|\bfx\b|currenc/.test(n)) return 'macro';
  if (/theme/.test(n)) return 'theme';
  return 'candidate';
}

// 'NASDAQ:CAKE' | 'AMS:ASML' | 'FX:GBPUSD' | 'CAKE'
export function parseSymbolToken(token) {
  const raw = token.trim();
  if (!raw) return null;

  let tvExchange = null;
  let symbol = raw;
  const colon = raw.indexOf(':');
  if (colon !== -1) {
    tvExchange = raw.slice(0, colon).trim().toUpperCase();
    symbol = raw.slice(colon + 1).trim();
  }
  symbol = symbol.toUpperCase();
  if (!symbol) return null;

  const isFx = (tvExchange && FX_EXCHANGE_PREFIXES.has(tvExchange)) || isCurrencyPair(symbol);
  return {
    raw,
    tvExchange,
    displaySymbol: symbol,
    assetClass: isFx ? 'fx' : 'equity',
  };
}

/**
 * @param {string} text — raw contents of the TradingView export file.
 * @returns {{ sections: Array<{ name: string, role: string,
 *             items: Array<{ raw, tvExchange, displaySymbol, assetClass }> }> }}
 */
export function parseTvExport(text) {
  const tokens = String(text)
    .split(/[\r\n,]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const sections = [];
  let current = null;

  const ensureDefault = () => {
    if (!current) {
      current = { name: 'Imported', role: 'candidate', items: [] };
      sections.push(current);
    }
  };

  for (const tok of tokens) {
    if (tok.startsWith('###')) {
      const name = tok.replace(/^#+/, '').trim() || 'Imported';
      current = { name, role: sectionRole(name), items: [] };
      sections.push(current);
      continue;
    }
    ensureDefault();
    const item = parseSymbolToken(tok);
    if (item) current.items.push(item);
  }

  // Drop empty sections (a header with no symbols under it).
  return { sections: sections.filter(s => s.items.length > 0) };
}
