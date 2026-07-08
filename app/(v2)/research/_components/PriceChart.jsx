'use client';

// Extracted verbatim from research/page.jsx so recharts loads in an async chunk
// (via next/dynamic) instead of on the research route's critical path. The chart
// logic is unchanged. Helpers that the rest of the page still uses (fmtDollars,
// PEER_COLORS) are duplicated here; helpers used only by this chart (sliceHistory,
// fmtXTick, fmtYAxis, BeatChip, EarningsLabel, PRICE_RANGES) moved here.
import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import Card from '@/app/(v2)/_components/Card';

const PEER_COLORS = ['var(--accent-cyan)', 'var(--warn)', 'var(--positive-soft)'];

function fmtDollars(n) {
  if (n == null) return '—';
  return '$' + n.toFixed(2);
}

function sliceHistory(prices, range) {
  if (!prices?.length) return [];
  const now   = new Date();
  let cutoff;
  if (range === '1M')  { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 1); }
  else if (range === '3M')  { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3); }
  else if (range === '6M')  { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 6); }
  else if (range === 'YTD') { cutoff = new Date(now.getFullYear(), 0, 1); }
  else if (range === '1Y')  { cutoff = new Date(now); cutoff.setFullYear(now.getFullYear() - 1); }
  else return prices; // 5Y / ALL
  const cutStr = cutoff.toISOString().slice(0, 10);
  return prices.filter(d => d.date >= cutStr);
}

function fmtXTick(dateStr, range) {
  const d = new Date(dateStr);
  if (range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (range === '3M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function fmtYAxis(v) {
  if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'k';
  return '$' + v.toFixed(0);
}

function BeatChip({ letter, beat }) {
  if (beat === null) return null;
  const bg    = beat ? 'var(--positive-soft)' : 'var(--negative-soft)';
  const color = '#0d1117';
  return (
    <div style={{
      width: 14, height: 10, background: bg, borderRadius: 2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 7, fontWeight: 800, color, cursor: 'default',
    }}>
      {letter}
    </div>
  );
}

// Custom Recharts reference-line label for earnings markers
function EarningsLabel({ viewBox, data }) {
  if (!viewBox) return null;
  const { x } = viewBox;
  const { revBeat, epsBeat } = data;
  return (
    <g transform={`translate(${x - 7}, 5)`}>
      <foreignObject width={14} height={26}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <BeatChip letter="R" beat={revBeat} />
          <BeatChip letter="E" beat={epsBeat} />
        </div>
      </foreignObject>
    </g>
  );
}

const PRICE_RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];

export default function PriceChart({ ticker, overlayPeers = [], setOverlayPeers, earningsHistory = [] }) {
  const [allPrices,    setAllPrices]    = useState(null); // { [ticker]: priceArr }
  const [loading,      setLoading]      = useState(true);
  const [range,        setRange]        = useState('3M');
  const [yearsLoaded,  setYearsLoaded]  = useState(1);

  // Fetch (or re-fetch for 5Y/ALL)
  const doFetch = useCallback(async (years) => {
    setLoading(true);
    const tList = [ticker, ...overlayPeers].join(',');
    try {
      const res  = await fetch(`/api/historical-prices?tickers=${tList}&years=${years}`);
      const json = await res.json();
      if (json?.data) {
        const map = {};
        for (const entry of json.data) map[entry.ticker] = entry.prices ?? [];
        setAllPrices(prev => ({ ...(prev ?? {}), ...map }));
        setYearsLoaded(years);
      }
    } catch {}
    setLoading(false);
  }, [ticker, overlayPeers]);

  useEffect(() => { doFetch(1); }, [ticker]); // reset on ticker change

  // When user picks 5Y/ALL, re-fetch 5 years if not already loaded
  function handleRange(r) {
    setRange(r);
    if ((r === '5Y' || r === 'ALL') && yearsLoaded < 5) doFetch(5);
  }

  // Build chart data keyed by date
  const basePrices = allPrices?.[ticker] ?? [];
  const sliced     = sliceHistory(basePrices, range);

  // Merge overlay peers into date-keyed objects
  const chartData = sliced.map(d => {
    const row = { date: d.date, price: d.close };
    for (const p of overlayPeers) {
      const pp = allPrices?.[p];
      if (pp) {
        const match = pp.find(x => x.date === d.date);
        if (match) row[`peer_${p}`] = match.close;
      }
    }
    return row;
  });

  // Earnings markers within range
  const rangeStart = sliced[0]?.date;
  const rangeEnd   = sliced.at(-1)?.date;
  const visibleEarnings = earningsHistory.filter(e => {
    const d = e.period?.slice(0, 10);
    return d && rangeStart && rangeEnd && d >= rangeStart && d <= rangeEnd;
  });

  const hasOverlay = overlayPeers.length > 0;

  return (
    <Card
      title="Price Chart"
      eyebrow={ticker}
      action={
        <div style={{ display: 'flex', gap: 2 }}>
          {PRICE_RANGES.map(r => (
            <button key={r} onClick={() => handleRange(r)} style={{
              background:   r === range ? 'var(--bg-hover)' : 'transparent',
              border:       '1px solid ' + (r === range ? 'var(--accent)' : 'var(--border-color)'),
              color:        r === range ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', fontWeight: 500,
            }}>{r}</button>
          ))}
        </div>
      }
    >
      {loading ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          Loading…
        </div>
      ) : chartData.length === 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          No price data
        </div>
      ) : (
        <>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="chart-price-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="var(--accent)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={v => fmtXTick(v, range)}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  axisLine={false} tickLine={false} minTickGap={40}
                />
                <YAxis
                  dataKey="price"
                  tickFormatter={fmtYAxis}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  axisLine={false} tickLine={false} width={52}
                  domain={['dataMin', 'dataMax']}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: 6, fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--text-muted)' }}
                  formatter={(v, name) => {
                    if (name === 'price') return [fmtDollars(v), ticker];
                    const p = name.replace('peer_', '');
                    return [fmtDollars(v), p];
                  }}
                />
                {/* Earnings reference lines */}
                {visibleEarnings.map(e => {
                  const d = e.period?.slice(0, 10);
                  if (!d) return null;
                  const revBeat = e.revenueActual != null && e.revenueEstimate != null
                    ? e.revenueActual >= e.revenueEstimate : null;
                  const epsBeat = e.actual != null && e.estimate != null
                    ? e.actual >= e.estimate : null;
                  return (
                    <ReferenceLine
                      key={d} x={d}
                      stroke="var(--text-muted)" strokeDasharray="3 3" strokeWidth={1}
                      label={<EarningsLabel data={{ revBeat, epsBeat }} />}
                    />
                  );
                })}
                <Area
                  type="monotone" dataKey="price"
                  stroke="var(--accent)" strokeWidth={2}
                  fill="url(#chart-price-fill)" dot={false}
                />
                {/* Peer overlays */}
                {overlayPeers.map((p, i) => (
                  <Line
                    key={p} type="monotone" dataKey={`peer_${p}`}
                    stroke={PEER_COLORS[i] ?? '#888'} strokeWidth={1.5}
                    dot={false} strokeDasharray="5 3"
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 16, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
              {ticker}
            </span>
            {overlayPeers.map((p, i) => (
              <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 16, height: 2, background: PEER_COLORS[i], borderRadius: 1, opacity: 0.8 }} />
                {p}
                <button
                  onClick={() => setOverlayPeers(prev => prev.filter(x => x !== p))}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: '0 2px' }}
                >✕</button>
              </span>
            ))}
            {visibleEarnings.length > 0 && (
              <span>Earnings markers: <span style={{ color: 'var(--positive-soft)' }}>■</span> beat &nbsp;<span style={{ color: 'var(--negative-soft)' }}>■</span> miss &nbsp;(R=Rev · E=EPS)</span>
            )}
          </div>
          {/* Test hook: // setOverlayPeers(['AMD', 'AVGO']) */}
        </>
      )}
    </Card>
  );
}
