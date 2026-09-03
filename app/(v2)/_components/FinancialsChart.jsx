'use client';

// Financials history: two stacked charts — a merged Revenue & margins chart with an
// Abs/% toggle (absolute dollar lines vs margin % lines), and Leverage below — sharing
// one period selector (TTM default · Quarterly · Annual) and one range selector (5Y
// default). Fetches /api/watchlist/financials once per symbol — which returns all three
// period series — then switches period + range client-side with no refetch (mirrors the
// price chart fetches once and slices). Reusable: mounted in the watchlist panel now,
// the research page later. Recharts loads in an async chunk via next/dynamic at the
// call site.
import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import Card from '@/app/(v2)/_components/Card';
import { useChartHeight } from '@/lib/useChartHeight';

const PERIODS = [['ttm', 'TTM'], ['quarterly', 'Quarterly'], ['annual', 'Annual']];
const RANGES = ['1Y', '3Y', '5Y', '10Y'];
const RANGE_YEARS = { '1Y': 1, '3Y': 3, '5Y': 5, '10Y': 10 };

const TOOLTIP = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12 };
const LEV_LABELS = { netDebt: 'Net debt', netDebtToEbitda: 'Net debt / EBITDA (TTM)' };

// Line configs for the merged Revenue & margins chart, as [dataKey, label, stroke,
// width]. Absolute mode: four dollar lines. Percentage mode: three margin lines —
// deliberately NO revenue line (a flat 100% line would compress the axis and squash
// the others).
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
const MODES = [['abs', 'Abs'], ['pct', '%']];

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

// Range filter on the period-end date. Plots what exists — no left-padding when a
// symbol has less history than the selected range.
function sliceByRange(rows, range) {
  if (!rows?.length) return [];
  const yrs = RANGE_YEARS[range];
  if (!yrs) return rows;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - yrs);
  const cut = cutoff.toISOString().slice(0, 10);
  return rows.filter(r => r.date && r.date >= cut);
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

// ── charts ────────────────────────────────────────────────────────────────────
// Merged Revenue & margins chart: absolute dollar lines, or margin % lines, per the
// Abs/% toggle — one axis at a time so the % view isn't squashed by a 100% revenue line.
function IncomeChart({ rows, height, mode }) {
  const pct = mode === 'pct';
  const lines  = pct ? PCT_LINES : ABS_LINES;
  const labels = pct ? PCT_LABELS : ABS_LABELS;
  const fmt    = pct ? fmtPct : fmtCurrency;
  return (
    <ChartBlock title={pct ? 'Margins' : 'Revenue & income'} subtitle={pct ? 'gross · operating · net' : undefined} height={height}>
      <LineChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis tickFormatter={fmt} width={pct ? 48 : 52} {...AXIS} />
        <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: 'var(--text-muted)' }} formatter={(v, n) => [fmt(v), labels[n] || n]} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={n => labels[n] || n} />
        {lines.map(([key, , stroke, sw]) => (
          <Line key={key} type="monotone" dataKey={key} stroke={stroke} strokeWidth={sw} dot={false} connectNulls />
        ))}
      </LineChart>
    </ChartBlock>
  );
}

function LeverageChart({ rows, height }) {
  return (
    <ChartBlock title="Leverage" subtitle="net debt (left) · net debt / EBITDA, TTM (right)" height={height}>
      <LineChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis yAxisId="left"  tickFormatter={fmtCurrency} width={52} {...AXIS} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={fmtMult} width={44} {...AXIS} />
        <Tooltip
          contentStyle={TOOLTIP} labelStyle={{ color: 'var(--text-muted)' }}
          formatter={(v, n) => n === 'netDebtToEbitda' ? [fmtMult(v), LEV_LABELS[n]] : [fmtCurrency(v), LEV_LABELS[n] || n]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={n => LEV_LABELS[n] || n} />
        <Line yAxisId="left"  type="monotone" dataKey="netDebt"         stroke="var(--accent)" strokeWidth={2}    dot={false} connectNulls />
        <Line yAxisId="right" type="monotone" dataKey="netDebtToEbitda" stroke="var(--warn)"   strokeWidth={1.75} dot={false} strokeDasharray="5 3" connectNulls />
      </LineChart>
    </ChartBlock>
  );
}

// ── container ─────────────────────────────────────────────────────────────────
export default function FinancialsChart({ symbol }) {
  const responsiveHeight = useChartHeight();
  const chartHeight = Math.round((responsiveHeight ?? 300) * 0.9); // two stacked → taller each
  const [state, setState] = useState({ status: 'loading' });
  const [period, setPeriod] = useState('ttm');
  const [range, setRange] = useState('5Y');
  const [mode, setMode] = useState('abs');   // Abs (currency) | % (margins)

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/watchlist/financials?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
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
  }, [symbol]);

  const payload = state.status === 'ready' ? state.payload : null;
  const noData = payload && payload.resolved === false;
  const rows = sliceByRange(payload?.periods?.[period] ?? [], range);

  const action = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <ButtonGroup options={PERIODS} value={period} onChange={setPeriod} />
      <ButtonGroup options={RANGES.map(r => [r, r])} value={range} onChange={setRange} />
      <ButtonGroup options={MODES} value={mode} onChange={setMode} />
    </div>
  );

  return (
    <Card title="Financials" eyebrow={symbol} action={action}>
      {state.status === 'loading' && <Msg>Loading financials…</Msg>}
      {state.status === 'error' && <Msg color="var(--negative)">Couldn’t load financials: {state.error}</Msg>}
      {noData && <Msg italic>No financial history on current plan.</Msg>}
      {payload && !noData && (
        rows.length === 0
          ? <Msg italic>No {period} data in this range.</Msg>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <IncomeChart   rows={rows} height={chartHeight} mode={mode} />
              <LeverageChart rows={rows} height={chartHeight} />
            </div>
          )
      )}
    </Card>
  );
}
