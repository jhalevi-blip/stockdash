// Number formatters for the v2 dashboard. Pure functions, no deps.

const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£' };

export const fmtCurrency = (n, d = 2, currency = 'USD') =>
  (CURRENCY_SYMBOL[currency] ?? '$') + Number(n).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export const fmtPct = (n, d = 2) =>
  (n >= 0 ? '+' : '') + Number(n).toFixed(d) + '%';

export const fmtSigned = (n, d = 2) =>
  (n >= 0 ? '+' : '') + Number(n).toFixed(d);

export const colorForChange = (n) =>
  n > 0 ? 'var(--positive)'
  : n < 0 ? 'var(--negative)'
  : 'var(--text-muted)';
