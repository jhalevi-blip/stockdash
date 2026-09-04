'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import dynamic from 'next/dynamic';
import Card from '@/app/(v2)/_components/Card';
import Dot from '@/app/(v2)/_components/Dot';
import ScreenSection from '@/app/(v2)/_components/ScreenSection';

// Reuse the Stock Research price chart (recharts loads in an async chunk). The
// panel drives it with light=true + fetchYears=5 (one fetch, sliced client-side)
// and a target-price line — all via the additive props on the component.
const PriceChart = dynamic(() => import('@/app/(v2)/research/_components/PriceChart'), {
  ssr: false,
  loading: () => <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading chart…</div>,
});

// Financials history (Revenue / Margins / Leverage) below the price chart. Reusable
// component (research page later); recharts loads in its own async chunk.
const FinancialsChart = dynamic(() => import('@/app/(v2)/_components/FinancialsChart'), {
  ssr: false,
  loading: () => <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading financials…</div>,
});

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
const POLL_MS = 60_000;

// ── formatting ────────────────────────────────────────────────────────────────
function fmtPrice(n, assetClass) {
  if (n == null) return '—';
  const digits = assetClass === 'fx' ? (Math.abs(n) < 20 ? 4 : 2) : 2;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pctColor(n) {
  if (n == null) return 'var(--text-muted)';
  return n >= 0 ? 'var(--positive)' : 'var(--negative)';
}

function Pct({ value }) {
  if (value == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return <span style={{ color: pctColor(value) }}>{value >= 0 ? '+' : ''}{value.toFixed(2)}%</span>;
}

function fmtClock(ms) {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

function AsOf({ ms, marketOpen, now }) {
  if (!ms) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const ageMin = Math.floor(((now ?? ms) - ms) / 60000);
  // "Stale" only flags a surprising gap while the market is open. A closed-market
  // gap is expected (spec §4: a flat 0.00% is "market closed", not "nothing happening").
  const stale = marketOpen && ageMin > 15;
  const rel = ageMin <= 0 ? 'just now' : ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin / 60)}h ago`;
  return (
    <span style={{ color: stale ? 'var(--warn)' : 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
      {fmtClock(ms)} · {rel}{stale ? ' · stale' : ''}
    </span>
  );
}

// vs-target: how far current price sits ABOVE the target, as a %. Negative = at or
// below target (in the buy zone) → green. (spec §3: distance-to-target visible.)
function VsTarget({ price, target }) {
  if (price == null || target == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const pct = ((price - target) / target) * 100;
  const inZone = pct <= 0;
  return (
    <span style={{ color: inZone ? 'var(--positive)' : 'var(--text-secondary)' }}>
      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%{inZone ? ' · buy zone' : ''}
    </span>
  );
}

// ── column sets by role (spec §3) ─────────────────────────────────────────────
const COLUMNS = {
  candidate: ['Symbol', 'Price', 'Chg%', 'Target', 'vs Target', 'As of'],
  theme:     ['Symbol', 'Price', 'Chg%', 'Theme', 'Thesis', 'As of'],
  macro:     ['Symbol', 'Price', 'Chg%', 'As of'],
};

const th = {
  textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600,
  letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap',
};
const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--border-color)', verticalAlign: 'top' };

function SymbolCell({ item }) {
  const grey = !item.resolved;
  return (
    <td style={{ ...td, fontWeight: 600, color: grey ? 'var(--text-muted)' : 'var(--text-primary)' }}>
      {item.displaySymbol}
      {item.exchange && (
        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, color: 'var(--text-muted)' }}>{item.exchange}</span>
      )}
    </td>
  );
}

// Renders the price + change cells, or a surfaced error / unresolved label that
// spans them. Returns an array of <td>s so column counts stay aligned per role.
function priceCells(item) {
  const q = item.quote;
  if (q.status === 'unresolved') {
    return [
      <td key="p" style={{ ...td, color: 'var(--text-muted)', fontStyle: 'italic' }} colSpan={2}>{q.label}</td>,
    ];
  }
  if (q.status === 'error') {
    return [
      <td key="p" style={{ ...td, color: 'var(--negative)' }} colSpan={2}>quote failed: {q.error}</td>,
    ];
  }
  return [
    <td key="p" style={{ ...td, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(q.price, item.assetClass)}</td>,
    <td key="c" style={{ ...td, fontVariantNumeric: 'tabular-nums' }}><Pct value={q.changePct} /></td>,
  ];
}

// Inline-editable table cell. Click to edit, Enter/blur to save, Esc to cancel.
// Every save failure is surfaced inline (no silent catch). `onSave(value)` must
// reject on failure so we can show it and keep the cell open for a retry.
function EditableCell({ value, kind, assetClass, placeholder, onSave, styleExtra }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const cancelled = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  function begin() {
    if (editing) return;
    setDraft(value == null ? '' : String(value));
    setError(null);
    setEditing(true);
  }

  function parse() {
    if (kind === 'price') {
      const t = draft.trim();
      if (t === '') return { ok: true, val: null };
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) return { ok: false, msg: 'Enter a positive number' };
      return { ok: true, val: n };
    }
    const t = draft.trim();
    return { ok: true, val: t === '' ? null : t };
  }

  // Single commit path (blur). Enter/Esc route through blur() so nothing double-fires.
  async function onBlur() {
    if (cancelled.current) { cancelled.current = false; setEditing(false); setError(null); return; }
    if (busy.current) return;
    const p = parse();
    if (!p.ok) { setError(p.msg); inputRef.current?.focus(); return; }
    const orig = value == null ? null : value;
    if (p.val === orig) { setEditing(false); return; } // no change → no request
    busy.current = true; setSaving(true); setError(null);
    try {
      await onSave(p.val);
      setEditing(false);
    } catch (e) {
      setError(e?.message || 'Save failed');
      inputRef.current?.focus();
    } finally {
      setSaving(false); busy.current = false;
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; inputRef.current?.blur(); }
  }

  if (editing) {
    return (
      <td style={{ ...td, ...styleExtra }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            disabled={saving}
            inputMode={kind === 'price' ? 'decimal' : undefined}
            placeholder={placeholder}
            style={{
              width: kind === 'price' ? 92 : '100%', minWidth: kind === 'price' ? 72 : 160,
              padding: '3px 6px', fontSize: 13, fontFamily: FONT, borderRadius: 4, outline: 'none',
              background: 'var(--bg-page-deep)', color: 'var(--text-primary)',
              border: `1px solid ${error ? 'var(--negative)' : 'var(--accent)'}`,
              opacity: saving ? 0.6 : 1,
            }}
          />
          {error && <span style={{ fontSize: 11, color: 'var(--negative)' }}>{error}</span>}
        </div>
      </td>
    );
  }

  const empty = value == null || value === '';
  return (
    <td onClick={begin} title="Click to edit" style={{ ...td, ...styleExtra, cursor: 'pointer' }}>
      <span style={{ color: empty ? 'var(--text-muted)' : undefined, fontStyle: empty ? 'italic' : 'normal' }}>
        {empty ? (placeholder || 'Set') : (kind === 'price' ? fmtPrice(value, assetClass) : value)}
      </span>
    </td>
  );
}

function Row({ item, role, marketOpen, now, onPatch, selected, onSelect }) {
  const q = item.quote;
  const asOf = q.status === 'ok'
    ? <AsOf ms={q.asOf} marketOpen={marketOpen} now={now} />
    : <span style={{ color: 'var(--text-muted)' }}>—</span>;

  // Row click selects the row for the detail panel. Clicks that land on an
  // editable cell still begin editing (both handlers fire on bubble) — selecting
  // the row you're editing is harmless. Highlight the active row.
  return (
    <tr
      onClick={() => onSelect?.(item)}
      aria-selected={selected || undefined}
      style={{
        cursor: 'pointer',
        background: selected ? 'var(--bg-hover)' : undefined,
        boxShadow: selected ? 'inset 3px 0 0 0 var(--accent)' : undefined,
      }}
    >
      <SymbolCell item={item} />
      {/* price + change, or a colSpan={2} error/unresolved label (spec §2 step 3) */}
      {priceCells(item)}
      {role === 'candidate' && (
        <>
          <EditableCell
            value={item.targetPrice}
            kind="price"
            assetClass={item.assetClass}
            placeholder="Set target"
            styleExtra={{ fontVariantNumeric: 'tabular-nums' }}
            onSave={val => onPatch(item.id, { target_price: val })}
          />
          <td style={td}>{q.status === 'ok' ? <VsTarget price={q.price} target={item.targetPrice} /> : '—'}</td>
        </>
      )}
      {role === 'theme' && (
        <>
          <td style={{ ...td, color: 'var(--text-secondary)' }}>{item.themeSlug || '—'}</td>
          <EditableCell
            value={item.thesis}
            kind="text"
            placeholder="Add thesis"
            styleExtra={{ color: 'var(--text-secondary)', maxWidth: 320 }}
            onSave={val => onPatch(item.id, { thesis: val })}
          />
        </>
      )}
      {/* macro: no extra columns */}
      <td style={td}>{asOf}</td>
    </tr>
  );
}

// ── client-side sort within a section (no new API calls) ──────────────────────
// Header label → sort key. Only these columns are sortable; the rest (Theme,
// Thesis, As of) render as plain, non-clickable headers.
const SORT_KEYS = { Symbol: 'symbol', Price: 'price', 'Chg%': 'chg', Target: 'target', 'vs Target': 'vsTarget' };

// The value a row sorts by for a given key. Returns null when it's missing — a
// missing target is never 0, and null-valued rows always sink to the bottom.
function sortValue(item, key) {
  const q = item.quote || {};
  const price = q.status === 'ok' ? (q.price ?? null) : null;
  const target = item.targetPrice ?? null;
  switch (key) {
    case 'symbol': return item.displaySymbol ?? null;
    case 'price': return price;
    case 'chg': return q.status === 'ok' ? (q.changePct ?? null) : null;
    case 'target': return target;
    case 'vsTarget': return (price == null || target == null) ? null : (price - target) / target;
    default: return null;
  }
}

const isBlank = v => v == null || (typeof v === 'number' && Number.isNaN(v));

// Comparator that pins null-valued rows to the bottom in BOTH directions; only the
// ordering of non-null values flips with `dir`. Relies on Array.sort being stable
// so equal/blank rows keep their default (server) order.
function makeComparator(key, dir) {
  return (a, b) => {
    const va = sortValue(a, key), vb = sortValue(b, key);
    const ba = isBlank(va), bb = isBlank(vb);
    if (ba || bb) return ba && bb ? 0 : ba ? 1 : -1;   // nulls last, regardless of dir
    const cmp = typeof va === 'string' || typeof vb === 'string'
      ? String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' })
      : va - vb;
    return dir === 'desc' ? -cmp : cmp;
  };
}

function SectionTable({ section, markets, now, onPatch, selectedId, onSelect }) {
  const role = COLUMNS[section.role] ? section.role : 'candidate';
  const cols = COLUMNS[role];
  // Which session governs this section's "stale" flag: fx sections → FX, else US.
  const marketOpen = section.role === 'macro' ? !!markets?.fx?.isOpen : !!markets?.equity?.isOpen;

  // Per-section sort. key=null → default (server) order, untouched until a click;
  // clicking a header sorts asc, clicking the active one again reverses it.
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const toggle = key => setSort(p => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const items = useMemo(
    () => (sort.key ? [...section.items].sort(makeComparator(sort.key, sort.dir)) : section.items),
    [section.items, sort],
  );

  return (
    <Card title={section.name} eyebrow={role} style={{ marginBottom: 16 }} padding="0">
      {section.items.length === 0 ? (
        <p style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}>No symbols in this section.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
            <thead>
              <tr>
                {cols.map(c => {
                  const key = SORT_KEYS[c];
                  const active = key && sort.key === key;
                  return (
                    <th
                      key={c}
                      onClick={key ? () => toggle(key) : undefined}
                      title={key ? `Sort by ${c}` : undefined}
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      style={{
                        ...th,
                        cursor: key ? 'pointer' : 'default',
                        userSelect: 'none',
                        color: active ? 'var(--text-secondary)' : th.color,
                      }}
                    >
                      {c}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {items.map(it => <Row key={it.id} item={it} role={role} marketOpen={marketOpen} now={now} onPatch={onPatch} selected={it.id === selectedId} onSelect={onSelect} />)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MarketDot({ label, session }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
      <Dot color={session?.isOpen ? 'var(--positive)' : 'var(--text-muted)'} />
      {label} {session?.isOpen ? 'open' : 'closed'}
    </span>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
// Right-hand master–detail pane: price chart, key stats, quarterly financials.
// Fundamentals come from /api/watchlist/fundamentals; the chart reuses the Stock
// Research component against /api/historical-prices (light series). OUT OF SCOPE
// (per spec/task): ownership breakdown, segment revenue, capital-structure bars,
// peer comparison.

// Abbreviated dollar magnitude for cap / EV / debt / cash / statement lines.
function fmtBigDollars(n) {
  if (n == null) return '—';
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toLocaleString('en-US')}`;
}
const fmtRatio = n => (n == null ? '—' : `${n.toFixed(1)}×`);
function fmtLongDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function QuartersTable({ quarters }) {
  const qLabel = q => (q.period && q.fiscalYear ? `${q.period} FY${String(q.fiscalYear).slice(-2)}` : (q.date || '—'));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
        <thead>
          <tr>
            <th style={qTh}>Quarter</th>
            <th style={{ ...qTh, textAlign: 'right' }}>Revenue</th>
            <th style={{ ...qTh, textAlign: 'right' }}>Gross profit</th>
            <th style={{ ...qTh, textAlign: 'right' }}>Net income</th>
          </tr>
        </thead>
        <tbody>
          {quarters.map((q, i) => (
            <tr key={q.date || i}>
              <td style={qTd}>{qLabel(q)}</td>
              <td style={{ ...qTd, textAlign: 'right' }}>{fmtBigDollars(q.revenue)}</td>
              <td style={{ ...qTd, textAlign: 'right' }}>{fmtBigDollars(q.grossProfit)}</td>
              <td style={{ ...qTd, textAlign: 'right' }}>{fmtBigDollars(q.netIncome)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Fetches + renders the fundamentals for a resolved row. Always mounted with a
// key={item.id} by DetailPanel so hook order stays stable and state resets per
// symbol (a fresh 5Y chart fetch + fundamentals fetch on every switch).
function ResolvedDetail({ item }) {
  const symbol = item.providerSymbol || item.displaySymbol;
  const [f, setF] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setF({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/watchlist/fundamentals?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
        if (!res.ok) {
          let msg = `Request failed (HTTP ${res.status})`;
          try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep status-line msg */ }
          throw new Error(msg);
        }
        const data = await res.json();
        if (!cancelled) setF({ status: 'ready', data });
      } catch (e) {
        if (!cancelled) setF({ status: 'error', error: e?.message || 'Failed to load' });
      }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  const fund = f.status === 'ready' ? f.data : null;
  const noData = fund && fund.resolved === false; // route said no data on this plan

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Screen-surfaced symbol (not tracked): make that state visible. */}
      {item.notInWatchlist && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.displaySymbol}</span>
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 10,
            border: '1px solid var(--border-color)', color: 'var(--text-muted)', whiteSpace: 'nowrap',
          }}>not in your watchlist</span>
        </div>
      )}

      {/* 1. Price chart — reused Stock Research component, larger, light series,
             5Y fetched once + sliced, target line when the row has a target. */}
      <PriceChart
        ticker={symbol}
        light
        fetchYears={5}
        ranges={['1M', '6M', '1Y', '5Y']}
        initialRange="1Y"
        targetPrice={item.targetPrice ?? null}
        height={380}
      />

      {/* 2. Financials history — Revenue / Margins / Leverage, from our own
             fundamentals_annual + fundamentals_quarterly tables (no FMP). */}
      <FinancialsChart symbol={symbol} />

      {/* 3. Key stats */}
      <Card title="Key stats" eyebrow={item.displaySymbol}>
        {f.status === 'loading' && <p style={panelMsg}>Loading fundamentals…</p>}
        {f.status === 'error' && <p style={{ ...panelMsg, color: 'var(--negative)' }}>Couldn’t load fundamentals: {f.error}</p>}
        {noData && <p style={{ ...panelMsg, fontStyle: 'italic' }}>No data on current plan.</p>}
        {fund && !noData && (
          <div style={statGrid}>
            <Stat label="Market cap" value={fmtBigDollars(fund.marketCap)} />
            <Stat label="Enterprise value" value={fmtBigDollars(fund.enterpriseValue)} />
            <Stat label="Total debt" value={fmtBigDollars(fund.totalDebt)} />
            <Stat label="Cash & equiv." value={fmtBigDollars(fund.cashAndEquivalents)} />
            <Stat label="P/E (TTM)" value={fmtRatio(fund.peRatio)} />
            <Stat label="P/S (TTM)" value={fmtRatio(fund.psRatio)} />
            <Stat label="Next earnings" value={fmtLongDate(fund.nextEarningsDate)} />
          </div>
        )}
      </Card>

      {/* 3. Quarterly revenue / gross profit / net income — last 5 quarters */}
      <Card title="Quarterly financials" eyebrow="last 5 quarters">
        {f.status === 'loading' && <p style={panelMsg}>Loading…</p>}
        {f.status === 'error' && <p style={{ ...panelMsg, color: 'var(--negative)' }}>—</p>}
        {noData && <p style={{ ...panelMsg, fontStyle: 'italic' }}>No data on current plan.</p>}
        {fund && !noData && (
          fund.quarters?.length ? <QuartersTable quarters={fund.quarters} /> : <p style={panelMsg}>No quarterly data.</p>
        )}
      </Card>
    </div>
  );
}

// Synthetic detail-panel item for a symbol the screen surfaced that isn't in the
// watchlist. Same shape ResolvedDetail reads; `notInWatchlist` drives the badge.
function makeScreenItem(symbol) {
  return {
    id: `screen:${symbol}`,
    displaySymbol: symbol,
    providerSymbol: symbol,
    assetClass: 'equity',
    exchange: null,
    resolved: true,
    targetPrice: null,
    notInWatchlist: true,
  };
}

function DetailPanel({ item }) {
  if (!item) {
    return (
      <Card title="Detail" style={{ minHeight: 360 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a row to see its detail.</p>
      </Card>
    );
  }
  // Unresolved (e.g. 6479): no data on this plan; skip both fetches entirely.
  if (!item.resolved) {
    return (
      <Card title={item.displaySymbol} eyebrow={item.exchange || item.assetClass} style={{ minHeight: 360 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
          No data on current plan{item.exchange ? ` (${item.exchange})` : ''}.
        </p>
      </Card>
    );
  }
  // Remount per symbol → stable hook order + clean per-symbol fetch state.
  return <ResolvedDetail key={item.id} item={item} />;
}

export default function WatchlistPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [state, setState] = useState({ status: 'loading' }); // loading | refreshing | ready | error
  const dataRef = useRef(null);

  // Which row is open in the detail panel. Default = first row of the first
  // section; recovers to that default if the current selection disappears. A poll
  // refresh keeps the user's live choice (we only reselect when it's gone).
  const [selectedId, setSelectedId] = useState(null);

  // A screen row can also drive the detail panel. When set it takes precedence over the
  // watchlist selection; cleared whenever a watchlist row is clicked.
  const [screenSymbol, setScreenSymbol] = useState(null);

  // Mount-gated clock, ticking each minute, so the "as of" relative labels stay live
  // without calling Date.now() during render (mirrors the Sidebar clock pattern).
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    setState(prev => (silent && prev.data ? { ...prev, status: 'refreshing' } : { status: 'loading' }));
    try {
      const res = await fetch('/api/watchlist/quotes', { cache: 'no-store' });
      if (!res.ok) {
        // Surface the server's error message; fall back to the status line.
        let msg = `Request failed (HTTP ${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep status-line msg */ }
        setState({ status: 'error', error: msg, data: dataRef.current });
        return;
      }
      const data = await res.json();
      dataRef.current = data;
      setState({ status: 'ready', data });
    } catch (e) {
      setState({ status: 'error', error: e?.message || 'Network error', data: dataRef.current });
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) load();
  }, [isLoaded, isSignedIn, load]);

  // Inline edit → PATCH the single row, then reflect it locally. Throws on failure
  // so the editing cell can surface the error and stay open for a retry.
  const patchItem = useCallback(async (itemId, dbPatch) => {
    const res = await fetch(`/api/watchlist/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbPatch),
    });
    if (!res.ok) {
      let msg = `Save failed (HTTP ${res.status})`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep status-line msg */ }
      throw new Error(msg);
    }
    await res.json(); // confirmed write
    setState(prev => {
      if (!prev.data) return prev;
      const camel = {};
      if ('target_price' in dbPatch) camel.targetPrice = dbPatch.target_price;
      if ('thesis' in dbPatch) camel.thesis = dbPatch.thesis;
      const sections = prev.data.sections.map(s => ({
        ...s,
        items: s.items.map(it => (it.id === itemId ? { ...it, ...camel } : it)),
      }));
      const data = { ...prev.data, sections };
      dataRef.current = data;
      return { ...prev, data };
    });
  }, []);

  // Screen → detail panel. If the symbol is already tracked, select that watchlist row
  // (no "not in your watchlist" badge); otherwise open it as a screen-only symbol.
  const selectScreenSymbol = useCallback((sym) => {
    const S = String(sym).toUpperCase();
    for (const s of (dataRef.current?.sections ?? [])) {
      for (const it of s.items) {
        if ((it.providerSymbol || '').toUpperCase() === S || (it.displaySymbol || '').toUpperCase() === S) {
          setScreenSymbol(null); setSelectedId(it.id); return;
        }
      }
    }
    setSelectedId(null); setScreenSymbol(S);
  }, []);

  // Poll every 60s, but only while the tab is visible AND some relevant market is
  // open (spec §4). Refetch immediately when the tab becomes visible again.
  useEffect(() => {
    if (!isSignedIn) return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const m = dataRef.current?.markets;
      const anyOpen = m ? (m.equity?.isOpen || m.fx?.isOpen) : true;
      if (anyOpen) load({ silent: true });
    };
    const id = setInterval(tick, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load({ silent: true }); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [isSignedIn, load]);

  // ── render states ────────────────────────────────────────────────────────────
  if (isLoaded && !isSignedIn) {
    return <Shell><p style={msg}>Sign in to view your watchlist.</p></Shell>;
  }
  if (state.status === 'loading' && !state.data) {
    return <Shell><p style={msg}>Loading watchlist…</p></Shell>;
  }

  const data = state.data;
  const sections = data?.sections ?? [];
  const isEmpty = state.status !== 'loading' && sections.every(s => s.items.length === 0);

  // Effective selection, derived in render (no setState-in-effect): honor the
  // user's pick while its row still exists, otherwise default to the first row of
  // the first section. setSelectedId is only ever called from a row click.
  let firstId = null, selectionPresent = false;
  for (const s of sections) for (const it of s.items) {
    if (firstId === null) firstId = it.id;
    if (it.id === selectedId) selectionPresent = true;
  }
  const effectiveId = selectionPresent ? selectedId : firstId;
  let watchlistSelectedItem = null;
  for (const s of sections) for (const it of s.items) if (it.id === effectiveId) watchlistSelectedItem = it;
  // A screen-selected symbol takes precedence over the default/first watchlist row.
  const selectedItem = screenSymbol ? makeScreenItem(screenSymbol) : watchlistSelectedItem;

  return (
    <Shell markets={data?.markets} generatedAt={data?.generatedAt} refreshing={state.status === 'refreshing'} onRefresh={() => load({ silent: true })}>
      {state.status === 'error' && (
        <div style={{
          margin: '0 0 16px', padding: '10px 14px', borderRadius: 6, fontSize: 13,
          background: 'var(--bg-negative-subtle, rgba(248,81,73,0.12))',
          border: '1px solid var(--negative)', color: 'var(--negative)',
        }}>
          Couldn’t load quotes: {state.error}
          {data && <span style={{ color: 'var(--text-muted)' }}> — showing the last successful data.</span>}
          <button onClick={() => load()} style={retryBtn}>Retry</button>
        </div>
      )}

      {isEmpty && state.status !== 'error' && (
        <p style={msg}>
          Your watchlist is empty. Import a TradingView export with{' '}
          <code style={{ fontSize: 12 }}>scripts/import-watchlist.mjs</code>.
        </p>
      )}

      {/* Master–detail: sections table on the left (narrower), detail panel on the
          right. The panel is sticky so it stays in view while the table scrolls. */}
      <div style={masterDetail}>
        <div style={{ minWidth: 0 }}>
          {sections.map(s => (
            <SectionTable
              key={s.id ?? 'ungrouped'}
              section={s}
              markets={data?.markets}
              now={now}
              onPatch={patchItem}
              selectedId={screenSymbol ? null : effectiveId}
              onSelect={it => { setScreenSymbol(null); setSelectedId(it.id); }}
            />
          ))}
          {/* Screen — fills the space under the sections; clicking a row loads it into
              the detail panel on the right (same as a watchlist row). */}
          <ScreenSection onSelect={selectScreenSymbol} selectedSymbol={screenSymbol} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ position: 'sticky', top: 20 }}>
            <DetailPanel item={selectedItem} />
          </div>
        </div>
      </div>
    </Shell>
  );
}

const masterDetail = {
  display: 'grid',
  gridTemplateColumns: 'minmax(360px, 480px) minmax(0, 1fr)',
  gap: 16,
  alignItems: 'start',
};
const panelMsg = { color: 'var(--text-secondary)', fontSize: 13, margin: 0 };
const statGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 };
const qTh = {
  textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap',
};
const qTd = {
  padding: '7px 8px', fontSize: 13, borderBottom: '1px solid var(--border-color)',
  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
};
const msg = { color: 'var(--text-secondary)', fontSize: 14, padding: '8px 2px' };
const retryBtn = {
  marginLeft: 12, padding: '2px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
  background: 'transparent', color: 'var(--negative)', border: '1px solid var(--negative)',
};

function Shell({ children, markets, generatedAt, refreshing, onRefresh }) {
  return (
    <div style={{ padding: '20px 24px', maxWidth: 'none', margin: 0, fontFamily: FONT }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Watchlist</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            The list you maintain — live quotes, columns by role.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {markets && (
            <div style={{ display: 'flex', gap: 12 }}>
              <MarketDot label="US" session={markets.equity} />
              <MarketDot label="FX" session={markets.fx} />
            </div>
          )}
          {generatedAt && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {refreshing ? 'refreshing…' : `updated ${fmtClock(generatedAt)}`}
            </span>
          )}
          {onRefresh && (
            <button onClick={onRefresh} style={{
              padding: '4px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
              background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
            }}>Refresh</button>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
