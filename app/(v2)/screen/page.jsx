'use client';

// /screen — the quality-compounder-at-drawdown screen. One fetch to /api/screen on
// mount returns the funnel counts and the top-quintile-stability survivors; the
// drawdown threshold is a client-side control (default 35%) that filters those rows
// live without a refetch (the quintile is drawdown-independent). Table sort mirrors the
// watchlist: client-side, nulls pinned to the bottom, asc/desc toggle, stable order.
//
// Row click opens /research?ticker=X rather than the FinancialsChart panel: that panel
// fetches /api/watchlist/financials, which 404s for symbols not in the caller's
// watchlist — and screen names generally aren't.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Card from '@/app/(v2)/_components/Card';

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
const DEFAULT_DRAWDOWN = 35;   // percent, matches the spec's 35% floor

// ── formatters (roic / margins / goodwill / drawdown are FRACTIONS in the payload) ──
const finite = v => typeof v === 'number' && Number.isFinite(v);
const fmtPct1 = n => (finite(n) ? `${(n * 100).toFixed(1)}%` : '—');
const fmtPct0 = n => (finite(n) ? `${(n * 100).toFixed(0)}%` : '—');
const fmtPp = n => (finite(n) ? `${(n * 100).toFixed(2)} pp` : '—');
const fmtPrice = n => (finite(n) ? `$${n.toFixed(2)}` : '—');
const fmtInt = n => (finite(n) ? n.toLocaleString('en-US') : '—');

// ── columns ─────────────────────────────────────────────────────────────────────
// num=true → right-aligned, numeric sort; else left-aligned, string sort. Every
// column except Name is sortable (Name has no data source yet).
const COLUMNS = [
  { key: 'symbol',           label: 'Symbol',         num: false },
  { key: 'name',             label: 'Name',           num: false, sortable: false },
  { key: 'sector',           label: 'Sector',         num: false },
  { key: 'industry',         label: 'Industry',       num: false },
  { key: 'price',            label: 'Price',          num: true },
  { key: 'drawdownPct',      label: 'Drawdown',       num: true },
  { key: 'roic',             label: 'ROIC',           num: true },
  { key: 'roicReported',     label: 'ROIC (rep.)',    num: true },
  { key: 'goodwillShare',    label: 'Goodwill',       num: true },
  { key: 'grossMargin',      label: 'Gross margin',   num: true },
  { key: 'grossMarginStdev', label: 'GM stdev',       num: true },
  { key: 'rankPct',          label: 'Stability rank', num: true },
];

function renderCell(row, key) {
  switch (key) {
    case 'symbol':           return <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.symbol}</span>;
    case 'name':             return <span style={{ color: 'var(--text-muted)' }}>{row.name ?? '—'}</span>;
    case 'sector':           return <span style={{ color: 'var(--text-secondary)' }}>{row.sector ?? '—'}</span>;
    case 'industry':         return <span style={{ color: 'var(--text-secondary)' }}>{row.industry ?? '—'}</span>;
    case 'price':            return fmtPrice(row.price);
    case 'drawdownPct':      return fmtPct1(row.drawdownPct);
    case 'roic':             return fmtPct1(row.roic);
    case 'roicReported':     return fmtPct1(row.roicReported);
    case 'goodwillShare':    return fmtPct0(row.goodwillShare);
    case 'grossMargin':      return fmtPct1(row.grossMargin);
    case 'grossMarginStdev': return fmtPp(row.grossMarginStdev);
    case 'rankPct':
      return (
        <span>
          {fmtPct0(row.rankPct)}
          <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-muted)' }}>
            · {row.rankBasis === 'industry' ? 'ind' : 'sec'}
          </span>
        </span>
      );
    default: return '—';
  }
}

// ── client-side sort (watchlist pattern: nulls last both ways, stable) ────────────
const isBlank = v => v == null || (typeof v === 'number' && Number.isNaN(v));
function makeComparator(key, dir) {
  return (a, b) => {
    const va = a[key], vb = b[key];
    const ba = isBlank(va), bb = isBlank(vb);
    if (ba || bb) return ba && bb ? 0 : ba ? 1 : -1;   // nulls last regardless of dir
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

function ScreenTable({ rows }) {
  const router = useRouter();
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
              const sortable = c.sortable !== false;
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  onClick={sortable ? () => toggle(c.key) : undefined}
                  title={sortable ? `Sort by ${c.label}` : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  style={{
                    ...th,
                    textAlign: c.num ? 'right' : 'left',
                    cursor: sortable ? 'pointer' : 'default',
                    color: active ? 'var(--text-secondary)' : th.color,
                  }}
                >
                  {c.label}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr
              key={row.symbol}
              onClick={() => router.push(`/research?ticker=${encodeURIComponent(row.symbol)}`)}
              title={`Open ${row.symbol} in Stock Research`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; }}
            >
              {COLUMNS.map(c => (
                <td key={c.key} style={{ ...td, textAlign: c.num ? 'right' : 'left' }}>{renderCell(row, c.key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── funnel ────────────────────────────────────────────────────────────────────────
function Funnel({ funnel, threshold, passCount }) {
  const steps = [
    `${fmtInt(funnel.evaluable)} evaluable`,
    `${fmtInt(funnel.afterExclusions)} after thin-base & divergence exclusions`,
    `${fmtInt(funnel.passRoic)} pass ROIC`,
    `${fmtInt(funnel.topQuintile)} top-quintile`,
    `${fmtInt(passCount)} at ${threshold}% drawdown`,
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
      {steps.map((s, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: i === steps.length - 1 ? 'var(--text-primary)' : undefined, fontWeight: i === steps.length - 1 ? 600 : 400 }}>{s}</span>
          {i < steps.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
        </span>
      ))}
    </div>
  );
}

// ── drawdown control ───────────────────────────────────────────────────────────────
function DrawdownControl({ threshold, setThreshold, passCount }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>Min drawdown</span>
      <input
        type="range" min={0} max={90} step={1} value={threshold}
        onChange={e => setThreshold(Number(e.target.value))}
        aria-label="Minimum drawdown percent"
        style={{ width: 200, accentColor: 'var(--accent)' }}
      />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number" min={0} max={100} step={1} value={threshold}
          onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) setThreshold(Math.max(0, Math.min(100, n))); }}
          aria-label="Minimum drawdown percent"
          style={{
            width: 56, fontSize: 13, padding: '3px 6px', borderRadius: 4, textAlign: 'right',
            border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
          }}
        />
        <span style={{ color: 'var(--text-muted)' }}>%</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {passCount} name{passCount === 1 ? '' : 's'} qualify
      </span>
    </div>
  );
}

// Explicit empty state: distinguish "nothing this deep in drawdown" (with the nearest
// threshold that would surface a name) from "no names cleared the quality gates at all".
function EmptyState({ rows, threshold }) {
  const drawdowns = rows.map(r => r.drawdownPct).filter(finite);
  if (drawdowns.length === 0) {
    return <p style={emptyMsg}>No names cleared the quality gates, so there’s nothing to rank by drawdown.</p>;
  }
  const maxPct = Math.max(...drawdowns) * 100;
  const nearest = Math.floor(maxPct);
  return (
    <div style={{ ...emptyMsg, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span>Nothing is {threshold}% down right now — the {rows.length} quality name{rows.length === 1 ? '' : 's'} are all shallower than that.</span>
      <span style={{ color: 'var(--text-secondary)' }}>
        The most drawn-down qualifying name is at <strong>{maxPct.toFixed(1)}%</strong>. Lower the threshold to <strong>{nearest}%</strong> to see it.
      </span>
    </div>
  );
}

export default function ScreenPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [state, setState] = useState({ status: 'loading' });   // loading | ready | error
  const [threshold, setThreshold] = useState(DEFAULT_DRAWDOWN);

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

  useEffect(() => { if (isLoaded && isSignedIn) load(); }, [isLoaded, isSignedIn, load]);

  const data = state.status === 'ready' ? state.data : null;
  // Client-side drawdown filter (drawdown_pct is a fraction; threshold is percent).
  const passing = useMemo(
    () => (data?.rows ?? []).filter(r => finite(r.drawdownPct) && r.drawdownPct * 100 >= threshold),
    [data, threshold],
  );

  let body;
  if (isLoaded && !isSignedIn) body = <p style={emptyMsg}>Sign in to run the screen.</p>;
  else if (state.status === 'loading') body = <p style={emptyMsg}>Running screen…</p>;
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
        <Funnel funnel={data.funnel} threshold={threshold} passCount={passing.length} />
        <DrawdownControl threshold={threshold} setThreshold={setThreshold} passCount={passing.length} />
        <Card title="Results" eyebrow="quality compounders at drawdown" padding="0">
          {passing.length === 0
            ? <div style={{ padding: 14 }}><EmptyState rows={data.rows} threshold={threshold} /></div>
            : <ScreenTable rows={passing} />}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', fontFamily: FONT }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Screen</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Durable-margin compounders (ROIC ≥ 13%, top-quintile gross-margin stability) trading in a drawdown.
        </p>
      </header>
      {body}
    </div>
  );
}

const emptyMsg = { color: 'var(--text-secondary)', fontSize: 14, margin: 0, padding: '8px 2px' };
const retryBtn = {
  marginLeft: 12, padding: '2px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
  background: 'transparent', color: 'var(--negative)', border: '1px solid var(--negative)',
};
