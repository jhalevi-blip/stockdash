export const f = (n, d = 2) =>
  n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';

export const usd = n =>
  n == null ? '—' : (n < 0 ? '-$' : '$') + f(Math.abs(n));

export const pctClass = v =>
  v == null ? 'neutral' : v >= 0 ? 'pos' : 'neg';

export const COLORS = [
  '#58a6ff','#3fb950','#f0883e','#bc8cff','#79c0ff',
  '#56d364','#ffa657','#ff7b72','#d2a8ff','#7ee787',
  '#ffa198','#a5d6ff','#e6edf3'
];