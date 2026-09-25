'use client';

// The quality-compounder-at-drawdown screen, embedded in the left column of the
// watchlist page. One fetch to /api/screen on mount returns the funnel counts, the
// surviving rows (through the 10-yr median operating-ROIC ≥ 15% gate, the ≥ 40% drawdown
// gate read from the daily screen_quotes table, and the per-user rejected filter), the
// short-history group (< 6 yrs of ROIC history: shown when latest-year ROIC ≥ 15% and
// drawdown ≥ 40%, never highlighted), and the flagged review group.
//
// Drawdown is deterministic: it reads price + 52-week high from screen_quotes (refreshed
// once per trading day after the close), so there is no live-fetch on the request path
// and no client threshold control. Per name we show the 10-yr median + latest operating
// ROIC, roic_reported, the
// drawdown + price-as-of DATE, both within-industry percentiles, their composite, and
// the highlight state. A ROIC-passer with no stored quote is shown as "no quote"
// (counted, never dropped); data older than 2 trading days shows a stale warning.
//
// Row click calls onSelect(symbol) to load that symbol into the watchlist detail panel.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/app/(v2)/_components/Card';

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

// ── formatters (roic / margins / drawdown / percentiles are FRACTIONS in the payload) ──
const finite = v => typeof v === 'number' && Number.isFinite(v);
const fmtPct1 = n => (finite(n) ? `${(n * 100).toFixed(1)}%` : '—');
const fmtPrice = n => (finite(n) ? `$${n.toFixed(2)}` : '—');
const fmtInt = n => (finite(n) ? n.toLocaleString('en-US') : '—');
// A within-industry percentile (0 = best) rendered as "top N%".
const fmtPctile = n => (finite(n) ? `top ${Math.max(1, Math.round(n * 100))}%` : '—');
const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// FMP prefixes many industry labels with their sector ("Software - Infrastructure").
const shortenLabel = s => {
  if (!s) return s;
  const i = s.indexOf(' - ');
  return i >= 0 ? s.slice(i + 3) : s;
};

function Trunc({ value, max }) {
  return (
    <span
      title={value ?? undefined}
      style={{ display: 'block', maxWidth: max, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
    >
      {shortenLabel(value) || '—'}
    </span>
  );
}

// Small "F" badge for a founder-led name (distinct from the ★ highlight, which means
// "best 20% of the industry composite"). Tooltip carries the founder's name + role.
function FounderBadge({ founder }) {
  if (!founder) return null;
  const title = `Founder-led — ${founder.name || 'founder'}${founder.role ? ` (${founder.role})` : ''}`;
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: 3, fontSize: 9, fontWeight: 700, lineHeight: 1,
        color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
        background: 'var(--bg-hover)', flex: '0 0 auto',
      }}
    >
      F
    </span>
  );
}

// ── columns ───────────────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'symbol',        label: 'Symbol',    num: false },
  { key: 'industry',      label: 'Industry',  num: false },
  { key: 'price',         label: 'Price',     num: true,  tip: 'Price + 52-week high from the daily screen_quotes refresh. The as-of date is shown beneath it.' },
  { key: 'drawdownPct',   label: 'Drawdown',  num: true,  tip: 'Price vs the stored 52-week high (FMP yearHigh). "no quote" = the daily refresh has no row for this name.' },
  { key: 'roic10yMedian', label: 'ROIC 10y',    num: true,  tip: 'THE GATE: 10-year median of per-fiscal-year operating ROIC (NOPAT ÷ operating invested capital). Must be ≥ 15%.' },
  { key: 'roicLatest',    label: 'ROIC latest', num: true,  tip: 'Most-recent fiscal year operating ROIC, same definition — kept alongside the through-cycle median.' },
  { key: 'roicReported',  label: 'ROIC rep.',   num: true,  tip: 'ROIC on the goodwill-inclusive invested-capital base, kept alongside the operating figure.' },
  { key: 'gmPercentile',  label: 'GM %ile',   num: true,  tip: 'Gross-margin-stability percentile within the industry (lower stdev = better).' },
  { key: 'levPercentile', label: 'Lev %ile',  num: true,  tip: 'Net-debt/EBITDA percentile within the industry (net cash best; EBITDA ≤ 0 worst).' },
  { key: 'composite',     label: 'Composite', num: true,  tip: 'Mean of the two industry percentiles. The best 20% (rankable industry, confirmed drawdown) is highlighted.' },
];

function PriceCell({ row }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
      <span>{fmtPrice(row.price)}</span>
      <span
        style={{ fontSize: 10, color: row.stale ? 'var(--negative)' : 'var(--text-muted)' }}
        title={row.asOf ? `Price as of ${new Date(row.asOf).toLocaleString()}${row.stale ? ' — stale (> 2 trading days old)' : ''}` : 'no quote'}
      >
        {row.noQuote ? '—' : `${row.stale ? '⚠ ' : ''}${fmtDate(row.asOf)}`}
      </span>
    </div>
  );
}

function PctileCell({ value, rankable }) {
  if (!rankable) return <span title="Industry too small to rank (fewer than 5 evaluable names)" style={{ color: 'var(--text-muted)' }}>—</span>;
  return <span>{fmtPctile(value)}</span>;
}

function renderCell(row, key) {
  switch (key) {
    case 'symbol':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span title={row.highlighted ? 'Highlighted: best 20% of the industry composite' : undefined} style={{ width: 10, color: 'var(--accent)' }}>{row.highlighted ? '★' : ''}</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.symbol}</span>
          <FounderBadge founder={row.founder} />
        </span>
      );
    case 'industry':      return <Trunc value={row.industry} max={150} />;
    case 'price':         return <PriceCell row={row} />;
    case 'drawdownPct':
      return row.noQuote
        ? <span title="No row in the daily screen_quotes refresh" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>no quote</span>
        : fmtPct1(row.drawdownPct);
    case 'roic10yMedian': return fmtPct1(row.roic10yMedian);
    case 'roicLatest':    return fmtPct1(row.roicLatest);
    case 'roicReported':  return fmtPct1(row.roicReported);
    case 'gmPercentile':  return <PctileCell value={row.gmPercentile} rankable={row.rankable} />;
    case 'levPercentile': return <PctileCell value={row.levPercentile} rankable={row.rankable} />;
    case 'composite':     return <PctileCell value={row.composite} rankable={row.rankable} />;
    default: return '—';
  }
}

// ── client-side sort (watchlist pattern: nulls last both ways, stable) ────────────
const isBlank = v => v == null || (typeof v === 'number' && Number.isNaN(v));
function makeComparator(key, dir) {
  return (a, b) => {
    const va = a[key], vb = b[key];
    const ba = isBlank(va), bb = isBlank(vb);
    if (ba || bb) return ba && bb ? 0 : ba ? 1 : -1;
    const cmp = typeof va === 'string' || typeof vb === 'string'
      ? String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' })
      : va - vb;
    return dir === 'desc' ? -cmp : cmp;
  };
}

const th = {
  textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600,
  letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', userSelect: 'none',
};
const td = {
  padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--border-color)',
  whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
};

function ScreenTable({ rows, onSelect, selectedSymbol }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const toggle = key => setSort(p => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const sorted = useMemo(
    () => (sort.key ? [...rows].sort(makeComparator(sort.key, sort.dir)) : rows),
    [rows, sort],
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
        <thead>
          <tr>
            {COLUMNS.map(c => {
              const active = sort.key === c.key;
              const title = c.tip || `Sort by ${c.label}`;
              return (
                <th
                  key={c.key}
                  onClick={() => toggle(c.key)}
                  title={title}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  style={{ ...th, textAlign: c.num ? 'right' : 'left', cursor: 'pointer', color: active ? 'var(--text-secondary)' : th.color }}
                >
                  {c.label}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const selected = selectedSymbol === row.symbol;
            const hl = row.highlighted;
            const bg = selected ? 'var(--bg-hover)' : (hl ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : '');
            return (
              <tr
                key={row.symbol}
                onClick={() => onSelect?.(row.symbol)}
                aria-selected={selected || undefined}
                title={`Load ${row.symbol} into the detail panel`}
                style={{
                  cursor: 'pointer',
                  background: bg || undefined,
                  boxShadow: (selected || hl) ? 'inset 3px 0 0 0 var(--accent)' : undefined,
                  opacity: row.noQuote ? 0.72 : 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = bg; }}
              >
                {COLUMNS.map(c => (
                  <td key={c.key} style={{ ...td, textAlign: c.num ? 'right' : 'left' }}>{renderCell(row, c.key)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── funnel ────────────────────────────────────────────────────────────────────────
function Funnel({ funnel }) {
  const steps = [
    `${fmtInt(funnel.evaluable)} evaluable`,
    `${fmtInt(funnel.passRoic)} pass ROIC`,
    `${fmtInt(funnel.passDrawdown)} pass drawdown`,
    `${fmtInt(funnel.afterRejected)} after rejected`,
    `${fmtInt(funnel.highlighted)} highlighted`,
  ];
  const fr = funnel.flaggedReasons || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        {steps.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: i === steps.length - 1 ? 'var(--text-primary)' : undefined, fontWeight: i === steps.length - 1 ? 600 : 400 }}>{s}</span>
            {i < steps.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {fmtInt(funnel.roicNotComputable)} ROIC not computable ·{' '}
        {fmtInt(funnel.shortHistory)} short history ({fmtInt(funnel.shortHistoryShown)} shown) ·{' '}
        {fmtInt(funnel.noQuote)} no quote · {fmtInt(funnel.flaggedGroup)} flagged for review
        {(finite(fr.nmRoic) || finite(fr.divergence)) && ` (${fmtInt(fr.nmRoic)} n/m ROIC, ${fmtInt(fr.divergence)} market-cap divergence)`}
      </div>
    </div>
  );
}

// Stale / missing quote-data banner.
function StaleBanner({ stale, dataAsOf }) {
  if (!stale) return null;
  const msg = dataAsOf
    ? `Quote data is stale (as of ${fmtDate(dataAsOf)}) — drawdowns may be out of date. The daily post-close refresh may not have run.`
    : 'No quote data yet — the daily screen_quotes refresh has not populated. Drawdowns are unavailable until it runs.';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6,
      fontSize: 12, color: 'var(--negative)',
      background: 'color-mix(in srgb, var(--negative) 10%, transparent)',
      border: '1px solid color-mix(in srgb, var(--negative) 40%, transparent)',
    }}>
      <span>⚠</span><span>{msg}</span>
    </div>
  );
}

// ── flagged review group ────────────────────────────────────────────────────────────
function FlaggedGroup({ flagged }) {
  const [open, setOpen] = useState(false);
  if (!flagged || flagged.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: 13, fontFamily: FONT,
        }}
      >
        <span><strong style={{ color: 'var(--text-primary)' }}>{flagged.length}</strong> flagged for review (never highlighted, never dropped)</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
            <tbody>
              {flagged.map(f => (
                <tr key={f.symbol}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>{f.symbol}</td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>{f.roicNm ? 'n/m' : fmtPct1(f.roic)}</td>
                  <td style={{ ...td, color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'normal' }}>{f.reasons.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── short-history group (< 6 yrs of computable ROIC history) ─────────────────────────
// Latest-year ROIC ≥ 15% AND ≥ 40% drawdown; never highlighted, never in main results.
function ShortHistoryGroup({ rows, onSelect, selectedSymbol }) {
  const [open, setOpen] = useState(false);
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: 13, fontFamily: FONT,
        }}
      >
        <span><strong style={{ color: 'var(--text-primary)' }}>{rows.length}</strong> short history (&lt; 6 yrs) — latest ROIC ≥ 15% &amp; ≥ 40% drawdown; never highlighted</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Symbol</th>
                <th style={{ ...th, textAlign: 'left' }}>Industry</th>
                <th style={{ ...th, textAlign: 'right' }} title="Years of computable operating-ROIC history">Years</th>
                <th style={{ ...th, textAlign: 'right' }}>ROIC latest</th>
                <th style={{ ...th, textAlign: 'right' }}>Drawdown</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const selected = selectedSymbol === r.symbol;
                return (
                  <tr
                    key={r.symbol}
                    onClick={() => onSelect?.(r.symbol)}
                    title={`Load ${r.symbol} into the detail panel`}
                    style={{ cursor: 'pointer', background: selected ? 'var(--bg-hover)' : undefined }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = selected ? 'var(--bg-hover)' : ''; }}
                  >
                    <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{r.symbol}<FounderBadge founder={r.founder} /></span>
                    </td>
                    <td style={td}><Trunc value={r.industry} max={150} /></td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtInt(r.historyYears)}y</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtPct1(r.roicLatest)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtPct1(r.drawdownPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ScreenSection({ onSelect, selectedSymbol }) {
  const [state, setState] = useState({ status: 'loading' });   // loading | ready | error

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/screen', { cache: 'no-store' });
      if (!res.ok) {
        let msg = `Request failed (HTTP ${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep status-line msg */ }
        throw new Error(msg);
      }
      const data = await res.json();
      setState({ status: 'ready', data });
    } catch (e) {
      setState({ status: 'error', error: e?.message || 'Failed to load' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const data = state.status === 'ready' ? state.data : null;

  let body;
  if (state.status === 'loading') body = <p style={emptyMsg}>Running screen…</p>;
  else if (state.status === 'error') {
    body = (
      <p style={{ ...emptyMsg, color: 'var(--negative)' }}>
        Couldn’t run the screen: {state.error}
        <button onClick={load} style={retryBtn}>Retry</button>
      </p>
    );
  } else if (data) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Funnel funnel={data.funnel} />
        <StaleBanner stale={data.stale} dataAsOf={data.dataAsOf} />
        <Card title="Results" eyebrow="quality compounders at drawdown" padding="0">
          {data.rows.length === 0
            ? <div style={{ padding: 14 }}><p style={emptyMsg}>No names cleared every gate (10-yr median operating ROIC ≥ 15%, ≥ 40% drawdown, not rejected).</p></div>
            : <ScreenTable rows={data.rows} onSelect={onSelect} selectedSymbol={selectedSymbol} />}
        </Card>
        <ShortHistoryGroup rows={data.shortHistoryRows} onSelect={onSelect} selectedSymbol={selectedSymbol} />
        <FlaggedGroup flagged={data.flaggedGroup} />
      </div>
    );
  }

  return (
    <section style={{ marginTop: 24, fontFamily: FONT }}>
      <header style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Screen</h2>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Durable-margin compounders (10-yr median operating ROIC ≥ 15%) trading ≥ 40% below their 52-week high; the best of each industry on margin stability + leverage are highlighted.
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FounderBadge founder={{ name: 'founder', role: '' }} />
          <span>= founder currently CEO or executive chair (where known)</span>
        </p>
      </header>
      {body}
    </section>
  );
}

const emptyMsg = { color: 'var(--text-secondary)', fontSize: 14, margin: 0, padding: '8px 2px' };
const retryBtn = {
  marginLeft: 12, padding: '2px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
  background: 'transparent', color: 'var(--negative)', border: '1px solid var(--negative)',
};
