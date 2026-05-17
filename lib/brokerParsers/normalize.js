export function norm(h) {
  return String(h ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

export function findCol(headers, candidates) {
  const nh = headers.map(norm);
  for (const c of candidates) {
    const i = nh.indexOf(norm(c));
    if (i !== -1) return i;
  }
  return -1;
}

export function parseDate(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  return isNaN(dt) ? s : dt.toISOString().slice(0, 10);
}

export function parseNum(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).replace(/[€$£\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function detectAction(rawAction, rawShares) {
  if (rawAction != null) {
    const s = String(rawAction).toLowerCase().trim();
    if (s.includes('koop') || s.includes('buy') || s.includes('purchase') || s === 'b') return 'buy';
    if (s.includes('verkoop') || s.includes('sell') || s.includes('sale') || s === 's') return 'sell';
  }
  if (rawShares != null) return rawShares > 0 ? 'buy' : 'sell';
  return null;
}
