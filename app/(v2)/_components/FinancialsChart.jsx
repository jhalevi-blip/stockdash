'use client';

// Financials history for the watchlist detail panel: a stats strip, a merged Revenue
// & margins chart (Abs/% toggle) and a Leverage chart, plus a peer set whose margin /
// leverage medians are drawn as muted lines and summarised in the strip. Period (TTM
// default · Quarterly · Annual) and range (5Y default) are shared; both switch client-
// side. Two fetches per symbol: peer resolution (/api/watchlist/peers, Finnhub or the
// user's saved override) then /api/watchlist/financials?peers=… (base full + peers
// trimmed to the median/CAGR fields). Editing a peer persists and refetches.
import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import Card from '@/app/(v2)/_components/Card';
import { useChartHeight } from '@/lib/useChartHeight';
import { peerMedianByLabel, computeRangeStats, peerMedianStats } from '@/lib/financials/stats';

const PERIODS = [['ttm', 'TTM'], ['quarterly', 'Quarterly'], ['annual', 'Annual']];
const RANGES = ['1Y', '3Y', '5Y', '10Y'];
const RANGE_YEARS = { '1Y': 1, '3Y': 3, '5Y': 5, '10Y': 10 };
const MODES = [['abs', 'Abs'], ['pct', '%']];

const TOOLTIP = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12 };
const LEV_LABELS = { netDebt: 'Net debt', netDebtToEbitda: 'Net debt / EBITDA (TTM)' };
const MEDIAN_FIELDS = ['grossMargin', 'operatingMargin', 'netMargin', 'netDebtToEbitda'];

// [dataKey, label, stroke, width]. Abs: four dollar lines. %: three margin lines
// (deliberately no revenue — a flat 100% line would squash the others).
const ABS_LINES = [
  ['revenue',         'Revenue',          'var(--accent)',        2],
  ['grossProfit',     'Gross profit',     'var(--accent-cyan)',   1.75],
  ['operatingIncome', 'Operating income', 'var(--warn)',          1.75],
  ['netIncome',       'Net income',       'var(--positive-soft)', 1.75],
];
const PCT_LINES = [
  ['grossMargin',     'Gross',     'var(--accent-cyan)',   1.75],
  ['operatingMargin', 'Operating', 'var(--warn)',          1.75],
  ['netMargin',       'Net',       'var(--positive-soft)', 1.75],
];
const labelMap = lines => Object.fromEntries(lines.map(([k, l]) => [k, l]));
const ABS_LABELS = labelMap(ABS_LINES);
const PCT_LABELS = labelMap(PCT_LINES);

// ── formatters ────────────────────────────────────────────────────────────────
function fmtCurrency(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = n < 0 ? '-' : '', a = Math.abs(n);
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(1)}T`;
  if (a >= 1e9)  return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6)  return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3)  return `${s}$${(a / 1e3).toFixed(0)}k`;
  return `${s}$${a.toFixed(0)}`;
}
const fmtPct  = n => (n == null || !Number.isFinite(n)) ? '—' : `${(n * 100).toFixed(1)}%`;
const fmtMult = n => (n == null || !Number.isFinite(n)) ? '—' : `${n.toFixed(1)}×`;

// Stats strip: [statKey, label, formatter].
const STAT_ROWS = [
  ['revenueCagr',     'Revenue CAGR',    fmtPct],
  ['grossMargin',     'Gross margin',    fmtPct],
  ['operatingMargin', 'Op. margin',      fmtPct],
  ['netMargin',       'Net margin',      fmtPct],
  ['netDebtToEbitda', 'Net debt/EBITDA', fmtMult],
];

// Range filter on the period-end date. Plots what exists — no left-padding.
function sliceByRange(rows, range) {
  if (!rows?.length) return [];
  const yrs = RANGE_YEARS[range];
  if (!yrs) return rows;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - yrs);
  const cut = cutoff.toISOString().slice(0, 10);
  return rows.filter(r => r.date && r.date >= cut);
}

// Total available history (range-independent) → "N years of data".
function historyYears(periods) {
  const dates = [...(periods?.quarterly ?? []), ...(periods?.annual ?? [])].map(r => r.date).filter(Boolean).sort();
  if (dates.length < 2) return dates.length;
  const yrs = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (365.25 * 864e5);
  return Math.max(1, Math.round(yrs));
}

// ── shared bits ───────────────────────────────────────────────────────────────
function ButtonGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          background: v === value ? 'var(--bg-hover)' : 'transparent',
          border: '1px solid ' + (v === value ? 'var(--accent)' : 'var(--border-color)'),
          color: v === value ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', fontWeight: 500,
        }}>{label}</button>
      ))}
    </div>
  );
}

function Msg({ children, color, italic }) {
  return <p style={{ color: color || 'var(--text-secondary)', fontSize: 13, margin: 0, fontStyle: italic ? 'italic' : 'normal' }}>{children}</p>;
}

const AXIS = { tick: { fill: 'var(--text-muted)', fontSize: 10 }, axisLine: false, tickLine: false };
const MEDIAN_STROKE = 'var(--text-muted)';

function ChartBlock({ title, subtitle, height, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h4>
        {subtitle && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{subtitle}</span>}
      </div>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  );
}

// A reclassification marker on the gross line — renders only where a row carries an
// anomaly, with a native SVG tooltip. Quarterly and TTM rows both carry the flag.
function AnomalyDot({ cx, cy, payload }) {
  if (cx == null || cy == null || !payload?.anomaly) return null;
  const a = payload.anomaly;
  const pp = (a.jumpPct * 100).toFixed(0), sign = a.jumpPct > 0 ? '+' : '';
  const title = String(payload.label).startsWith('TTM')
    ? `Includes ${a.sourceLabel}: gross margin moved ${sign}${pp} pp — this TTM window's shape may be an artifact (possible reclassification), not a business change.`
    : `Gross margin moved ${sign}${pp} pp from the prior quarter — possible accounting reclassification, not necessarily a business change.`;
  return (
    <g>
      <title>{title}</title>
      <circle cx={cx} cy={cy} r={4} fill="var(--negative)" stroke="var(--bg-card)" strokeWidth={1.5} />
    </g>
  );
}
const isGrossKey = k => k === 'grossMargin' || k === 'grossProfit';

// ── charts ────────────────────────────────────────────────────────────────────
function IncomeChart({ rows, height, mode, peerCount }) {
  const pct = mode === 'pct';
  const lines  = pct ? PCT_LINES : ABS_LINES;
  const labels = pct ? PCT_LABELS : ABS_LABELS;
  const fmt    = pct ? fmtPct : fmtCurrency;
  const showMedian = pct && peerCount > 0;   // dollar median across sizes is meaningless
  const subtitle = pct
    ? (showMedian ? `gross · operating · net — dashed = peer median of ${peerCount}` : 'gross · operating · net')
    : undefined;
  return (
    <ChartBlock title={pct ? 'Margins' : 'Revenue & income'} subtitle={subtitle} height={height}>
      <LineChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis tickFormatter={fmt} width={pct ? 48 : 52} {...AXIS} />
        <Tooltip
          contentStyle={TOOLTIP} labelStyle={{ color: 'var(--text-muted)' }}
          formatter={(v, n) => n.endsWith('Peer')
            ? [fmt(v), `${labels[n.slice(0, -4)] || n.slice(0, -4)} (peer med.)`]
            : [fmt(v), labels[n] || n]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} payload={lines.map(([key, label, stroke]) => ({ value: label, id: key, type: 'line', color: stroke }))} />
        {/* linear, not monotone: keep discrete points honest and step changes visible. */}
        {lines.map(([key, , stroke, sw]) => (
          <Line key={key} type="linear" dataKey={key} stroke={stroke} strokeWidth={sw}
            dot={isGrossKey(key) ? <AnomalyDot /> : false} connectNulls />
        ))}
        {/* Muted peer-median lines, % mode only. */}
        {showMedian && PCT_LINES.map(([key]) => (
          <Line key={`${key}Peer`} type="linear" dataKey={`${key}Peer`} stroke={MEDIAN_STROKE}
            strokeWidth={1} strokeDasharray="4 3" dot={false} connectNulls legendType="none" />
        ))}
      </LineChart>
    </ChartBlock>
  );
}

function LeverageChart({ rows, height, peerCount }) {
  return (
    <ChartBlock title="Leverage" subtitle={`net debt (left) · net debt / EBITDA, TTM (right)${peerCount ? ` — dashed = peer median of ${peerCount}` : ''}`} height={height}>
      <LineChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis yAxisId="left"  tickFormatter={fmtCurrency} width={52} {...AXIS} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={fmtMult} width={44} {...AXIS} />
        <Tooltip
          contentStyle={TOOLTIP} labelStyle={{ color: 'var(--text-muted)' }}
          formatter={(v, n) => n === 'netDebtToEbitda' ? [fmtMult(v), LEV_LABELS[n]]
            : n === 'netDebtToEbitdaPeer' ? [fmtMult(v), 'Net debt / EBITDA (peer med.)']
            : [fmtCurrency(v), LEV_LABELS[n] || n]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={n => LEV_LABELS[n] || n} />
        <Line yAxisId="left"  type="linear" dataKey="netDebt"         stroke="var(--accent)" strokeWidth={2}    dot={false} connectNulls />
        <Line yAxisId="right" type="linear" dataKey="netDebtToEbitda" stroke="var(--warn)"   strokeWidth={1.75} dot={false} strokeDasharray="5 3" connectNulls />
        {peerCount > 0 && (
          <Line yAxisId="right" type="linear" dataKey="netDebtToEbitdaPeer" stroke={MEDIAN_STROKE}
            strokeWidth={1} strokeDasharray="4 3" dot={false} connectNulls legendType="none" />
        )}
      </LineChart>
    </ChartBlock>
  );
}

function StatsStrip({ company, peer, peerCount }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', padding: '2px 0 2px' }}>
      {STAT_ROWS.map(([key, label, fmt]) => (
        <div key={key} style={{ minWidth: 92 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(company[key])}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>peer {peerCount ? fmt(peer[key]) : '—'}</div>
        </div>
      ))}
    </div>
  );
}

function PeersRow({ chips, source, peerCount, onRemove, onAdd, onReset, busy }) {
  const [input, setInput] = useState('');
  const submit = () => { const t = input.trim().toUpperCase(); if (t) { onAdd(t); setInput(''); } };
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>Peers{peerCount ? ` · median of ${peerCount}` : ''}:</span>
      {chips.length === 0 && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>none</span>}
      {chips.map(p => (
        <button
          key={p.ticker} onClick={() => onRemove(p.ticker)}
          title={p.hasData === false ? 'No fundamentals data — excluded from the median. Click to remove.' : 'Click to remove'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px', borderRadius: 10, cursor: 'pointer',
            border: '1px solid var(--border-color)', background: 'transparent',
            color: p.hasData === false ? 'var(--text-muted)' : 'var(--text-primary)', opacity: p.hasData === false ? 0.55 : 1,
          }}
        >{p.ticker}<span style={{ fontSize: 11 }}>×</span></button>
      ))}
      <input
        value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="add…" disabled={busy} aria-label="Add peer ticker"
        style={{ width: 56, fontSize: 11, padding: '2px 5px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      />
      {source === 'override' && (
        <button onClick={onReset} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer' }}>reset</button>
      )}
    </div>
  );
}

// ── container ─────────────────────────────────────────────────────────────────
export default function FinancialsChart({ symbol }) {
  const responsiveHeight = useChartHeight();
  const chartHeight = Math.round((responsiveHeight ?? 300) * 0.9); // two stacked → taller each
  const [state, setState] = useState({ status: 'loading' });
  const [period, setPeriod] = useState('ttm');
  const [range, setRange] = useState('5Y');
  const [mode, setMode] = useState('abs');
  const [peers, setPeers] = useState(null);       // effective peer tickers (null = resolving)
  const [peerSource, setPeerSource] = useState(null);
  const [busy, setBusy] = useState(false);

  // 1) Resolve the peer set for this symbol (saved override or Finnhub live).
  useEffect(() => {
    let cancelled = false;
    setPeers(null); setPeerSource(null);
    (async () => {
      try {
        const res = await fetch(`/api/watchlist/peers?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!cancelled) { setPeers(res.ok && Array.isArray(j.peers) ? j.peers : []); setPeerSource(j?.source ?? null); }
      } catch { if (!cancelled) { setPeers([]); setPeerSource(null); } }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  // 2) Fetch financials once the peer set is known; refetch when it changes.
  useEffect(() => {
    if (peers === null) return;
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const qs = peers.length ? `&peers=${encodeURIComponent(peers.join(','))}` : '';
        const res = await fetch(`/api/watchlist/financials?symbol=${encodeURIComponent(symbol)}${qs}`, { cache: 'no-store' });
        if (!res.ok) {
          let msg = `Request failed (HTTP ${res.status})`;
          try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep status-line msg */ }
          throw new Error(msg);
        }
        const payload = await res.json();
        if (!cancelled) setState({ status: 'ready', payload });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', error: e?.message || 'Failed to load' });
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, peers]);

  const savePeers = useCallback(async (list) => {
    setBusy(true);
    setPeers(list);   // optimistic → triggers the financials refetch
    try {
      await fetch('/api/watchlist/peers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, peers: list }) });
      setPeerSource('override');
    } catch { /* keep optimistic list; refetch still runs */ }
    setBusy(false);
  }, [symbol]);

  const removePeer = useCallback(t => savePeers((peers ?? []).filter(x => x !== t)), [peers, savePeers]);
  const addPeer = useCallback(t => {
    const cur = peers ?? [];
    if (!/^[A-Z0-9.\-]{1,20}$/.test(t) || cur.includes(t) || t === symbol.toUpperCase() || cur.length >= 8) return;
    savePeers([...cur, t]);
  }, [peers, savePeers, symbol]);
  const resetPeers = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`/api/watchlist/peers?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      const res = await fetch(`/api/watchlist/peers?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      setPeers(Array.isArray(j.peers) ? j.peers : []); setPeerSource(j?.source ?? 'finnhub');
    } catch { /* leave as-is */ }
    setBusy(false);
  }, [symbol]);

  const payload = state.status === 'ready' ? state.payload : null;
  const noData = payload && payload.resolved === false;

  const action = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <ButtonGroup options={PERIODS} value={period} onChange={setPeriod} />
      <ButtonGroup options={RANGES.map(r => [r, r])} value={range} onChange={setRange} />
      <ButtonGroup options={MODES} value={mode} onChange={setMode} />
    </div>
  );

  // Derived view (small data — recomputed per render).
  let body = null;
  if (state.status === 'loading') body = <Msg>Loading financials…</Msg>;
  else if (state.status === 'error') body = <Msg color="var(--negative)">Couldn’t load financials: {state.error}</Msg>;
  else if (noData) body = <Msg italic>No financial history on current plan.</Msg>;
  else if (payload) {
    const baseRows = sliceByRange(payload.periods?.[period] ?? [], range);
    const peerList = payload.peers ?? [];
    const withData = peerList.filter(p => p.hasData);
    const peerSlices = withData.map(p => sliceByRange(p.periods?.[period] ?? [], range));
    const medians = peerMedianByLabel(peerSlices, MEDIAN_FIELDS);
    const mergedRows = baseRows.map(r => {
      const m = medians.get(r.label);
      return {
        ...r,
        grossMarginPeer: m?.grossMargin ?? null,
        operatingMarginPeer: m?.operatingMargin ?? null,
        netMarginPeer: m?.netMargin ?? null,
        netDebtToEbitdaPeer: m?.netDebtToEbitda ?? null,
      };
    });
    const companyStats = computeRangeStats(baseRows);
    const peerStats = peerMedianStats(peerSlices);
    const peerCount = withData.length;
    // chips carry hasData from the payload; before financials load we'd only have tickers.
    const chips = peerList.length ? peerList : (peers ?? []).map(t => ({ ticker: t, hasData: undefined }));
    const years = historyYears(payload.periods);

    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <PeersRow chips={chips} source={peerSource} peerCount={peerCount} onRemove={removePeer} onAdd={addPeer} onReset={resetPeers} busy={busy} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{years} year{years === 1 ? '' : 's'} of data</span>
        </div>
        {baseRows.length === 0 ? (
          <Msg italic>No {period} data in this range.</Msg>
        ) : (
          <>
            <StatsStrip company={companyStats} peer={peerStats} peerCount={peerCount} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <IncomeChart   rows={mergedRows} height={chartHeight} mode={mode} peerCount={peerCount} />
              <LeverageChart rows={mergedRows} height={chartHeight} peerCount={peerCount} />
            </div>
          </>
        )}
      </div>
    );
  }

  return <Card title="Financials" eyebrow={symbol} action={action}>{body}</Card>;
}
