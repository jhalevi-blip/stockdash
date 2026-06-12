'use client';

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import Card from '@/app/(v2)/_components/Card';
import PortfolioModal from '@/components/PortfolioModal';
import InfoTooltip from '@/components/InfoTooltip';
import { fmtCurrency, fmtPct, colorForChange } from '@/app/(v2)/_lib/format';
import { loadUserHoldings, saveUserHoldings } from '@/lib/holdingsStorage';
import { calcDCF } from './_lib/dcf';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const SECTOR_COLOR = {
  'Technology':             'var(--accent)',
  'Semiconductors':         'var(--accent-cyan)',
  'Financial Services':     'var(--accent-cyan)',
  'Healthcare':             'var(--positive)',
  'Energy':                 '#d97706',
  'Consumer Cyclical':      'var(--positive)',
  'Consumer Defensive':     'var(--positive)',
  'Real Estate':            '#f0b429',
  'Industrials':            '#c084fc',
  'Communication Services': '#e879f9',
  'Utilities':              '#94a3b8',
  'Basic Materials':        '#fbbf24',
};

// Peer overlay color slots
const PEER_COLORS = ['var(--accent-cyan)', 'var(--warn)', 'var(--positive-soft)'];

// Rate-limit constants
const THESIS_LIMIT_SIGNED  = 5;
const THESIS_LIMIT_ANON    = 2;

// DCF slider defaults
const DCF_DEFAULTS = { wacc: 10, terminalGrowth: 3, revenueCagr: 22, terminalMargin: 60 };

// ─────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────

function fmtCap(n) {
  if (n == null) return '—';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'T';
  if (n >= 1e3)  return '$' + (n / 1e3).toFixed(1) + 'B';
  return '$' + n.toFixed(0) + 'M';
}

function fmtRatio(n) {
  if (n == null || !isFinite(n) || n <= 0) return '—';
  return n.toFixed(1) + 'x';
}

function fmtVol(n) {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
}

function fmtDollars(n) {
  if (n == null) return '—';
  return '$' + n.toFixed(2);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

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

// LocalStorage usage helpers (matches PortfolioAISummary pattern)
function readThesisUsage(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    if (s?.date === todayStr()) return s.count ?? 0;
  } catch {}
  return 0;
}
function writeThesisUsage(key, count) {
  localStorage.setItem(key, JSON.stringify({ date: todayStr(), count }));
}

// ─────────────────────────────────────────────────────────────
// SHARED PRICE BAR (thesis 3yr targets + DCF)
// ─────────────────────────────────────────────────────────────

function PriceBar({ bear, base, bull, current, label = 'Current' }) {
  const xMin  = Math.min(bear * 0.85, current * 0.9);
  const xMax  = Math.max(bull * 1.15, current * 1.1);
  const range = xMax - xMin || 1;
  const pct   = v => Math.max(0, Math.min(100, ((v - xMin) / range) * 100));

  const markers = [
    { v: bear,    color: 'var(--negative-soft)', label: `Bear ${fmtDollars(bear)}` },
    { v: base,    color: 'var(--accent)',         label: `Base ${fmtDollars(base)}` },
    { v: bull,    color: 'var(--positive-soft)',  label: `Bull ${fmtDollars(bull)}` },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      {/* Track */}
      <div style={{
        position: 'relative', height: 6, background: 'var(--border-color)', borderRadius: 3, margin: '0 8px',
      }}>
        {/* Filled base→bull range */}
        <div style={{
          position: 'absolute',
          left:  pct(bear) + '%',
          width: (pct(bull) - pct(bear)) + '%',
          height: '100%',
          background: 'linear-gradient(90deg, var(--negative-soft)30, var(--accent)50%, var(--positive-soft)30)',
          borderRadius: 3,
        }} />
        {/* Current price needle */}
        {current != null && (
          <div style={{
            position:  'absolute',
            left:      pct(current) + '%',
            top:       -5,
            width:     2,
            height:    16,
            background: 'var(--text-primary)',
            transform: 'translateX(-50%)',
            borderRadius: 1,
          }} />
        )}
      </div>
      {/* Labels row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 4, flexWrap: 'wrap' }}>
        {markers.map(m => (
          <span key={m.label} style={{ fontSize: 11, color: m.color, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {m.label}
          </span>
        ))}
        {current != null && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {label} {fmtDollars(current)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGO BUG
// ─────────────────────────────────────────────────────────────

function LogoBug({ ticker, imageUrl, brandColor }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = imageUrl && !imgFailed;
  const containerStyle = {
    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
    overflow: 'hidden', border: `1px solid ${brandColor}50`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  if (showImage) {
    return (
      <div style={containerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl} alt={`${ticker} logo`} loading="lazy"
          onError={() => setImgFailed(true)}
          style={{ width: 44, height: 44, objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }
  return (
    <div style={{
      ...containerStyle,
      background:    `linear-gradient(135deg, ${brandColor}28, ${brandColor}70)`,
      fontSize: 13, fontWeight: 700, color: brandColor,
      fontFamily: 'monospace', letterSpacing: '-.01em',
    }}>
      {ticker.slice(0, 2)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ACTION BUTTON
// ─────────────────────────────────────────────────────────────

function ActionBtn({ onClick, children, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background:   hover && !disabled ? 'var(--bg-hover)' : 'transparent',
        border:       '1px solid ' + (hover && !disabled ? 'var(--accent)' : 'var(--border-color)'),
        color:        disabled ? 'var(--text-muted)' : hover ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        transition: 'background .15s, border-color .15s, color .15s',
        whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// PLACEHOLDER BODY
// ─────────────────────────────────────────────────────────────

function PlaceholderBody({ label, height = 100 }) {
  return (
    <div style={{
      height, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontSize: 12,
    }}>
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BEAT CHIP for earnings markers
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 3 — PRICE CHART
// ─────────────────────────────────────────────────────────────

const PRICE_RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];

function PriceChart({ ticker, overlayPeers = [], setOverlayPeers, earningsHistory = [] }) {
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

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 2 — AI THESIS HERO
// ─────────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  'Why is this moving today?',
  'How does this fit my portfolio?',
  'Earnings preview',
  'Bull vs bear case',
  'Compare to peers',
];

function ratingColor(r) {
  if (r >= 8) return 'var(--rating-good)';
  if (r >= 4) return 'var(--rating-mid)';
  return 'var(--rating-bad)';
}
function ratingLabel(r) {
  if (r >= 8) return 'Strong Buy';
  if (r >= 6) return 'Buy';
  if (r >= 4) return 'Hold';
  if (r >= 2) return 'Weak';
  return 'Sell';
}

function BulletList({ items }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{
            flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
            background: 'var(--bg-accent-subtle)', border: '1px solid var(--border-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: 'var(--accent)',
          }}>{i + 1}</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item}</span>
        </li>
      ))}
    </ol>
  );
}

// thesis + setThesis are lifted to ResearchPageInner so DCFCalculator can read thesis.dcfInputs
function ThesisHero({ ticker, quote, metrics, isSignedIn, userId, savedHoldings, savedCash, thesis, setThesis, resolvedRevenue, priorAnnualRevenue }) {
  const usageKey   = `research_thesis_usage_${userId ?? 'anon'}`;
  const cacheKey   = `research_thesis_${ticker}`;
  const LIMIT      = isSignedIn ? THESIS_LIMIT_SIGNED : THESIS_LIMIT_ANON;

  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [usageCount,   setUsageCount]   = useState(0);
  const [generatedAt,  setGeneratedAt]  = useState(null);
  const [activeTab,    setActiveTab]    = useState('bull');
  const [quickResult,  setQuickResult]  = useState(null); // { prompt, response }
  const [quickLoading, setQuickLoading] = useState(false);

  // Reset local-only state on ticker change (thesis reset + cache load handled by parent)
  useEffect(() => {
    setError(null);
    setGeneratedAt(null);
    setQuickResult(null);
    setUsageCount(readThesisUsage(usageKey));
  }, [ticker, usageKey]);

  const limitReached = usageCount >= LIMIT;

  async function generate(overwrite = false) {
    if (limitReached && !overwrite) return;
    setLoading(true);
    setError(null);
    if (overwrite) setThesis(null); // clears parent state → resets DCF aiInputs

    const newCount = usageCount + 1;
    setUsageCount(newCount);
    writeThesisUsage(usageKey, newCount);

    try {
      const holdingsPayload = savedHoldings
        ?.filter(h => h.t !== '__CASH__')
        .map(h => ({ ticker: h.t, shares: h.s, avgCost: h.s > 0 ? (h.costVal != null ? h.costVal / h.s : h.c) : null, marketValue: h.mktVal ?? null }))
        ?? [];

      const res  = await fetch('/api/stock-ai-summary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          price:               quote?.price,
          userLang:            navigator.language || 'en',
          valD: {
            peRatio:     metrics?.peRatio,
            forwardPE:   metrics?.forwardPE,
            evEbitda:    metrics?.evEbitda,
            grossMargin: metrics?.grossMargin,
            netMargin:   metrics?.netMargin,
          },
          holdings:            holdingsPayload.length ? holdingsPayload : undefined,
          lastAnnualRevenue:  resolvedRevenue?.value ?? undefined,
          priorAnnualRevenue: priorAnnualRevenue ?? undefined,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.message ?? 'Generation failed');
      } else {
        setThesis(json);
        setGeneratedAt(new Date());
        try { localStorage.setItem(cacheKey, JSON.stringify(json)); } catch {}
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }

  async function fireQuickAction(prompt) {
    if (limitReached) return;
    setQuickLoading(true);
    setQuickResult({ prompt, response: null });
    const newCount = usageCount + 1;
    setUsageCount(newCount);
    writeThesisUsage(usageKey, newCount);
    try {
      // Compact, portfolio-aware payload — equities only, cap at 50 positions.
      // savedHoldings stores avg cost per share as `c`; dashboard-enriched rows
      // use `costVal` (total) instead, so prefer costVal when present, else `c`.
      const equities = (savedHoldings ?? [])
        .filter(h => h.t !== '__CASH__')
        .slice(0, 50)
        .map(h => ({
          ticker:  h.t,
          shares:  h.s,
          avgCost: h.s > 0 ? (h.costVal != null ? h.costVal / h.s : h.c) : undefined,
        }));
      // Prefer cash threaded from the /api/portfolio mount fetch; fall back to a
      // __CASH__ sentinel row for the localStorage (openModal) path.
      const cashRow = (savedHoldings ?? []).find(h => h.t === '__CASH__');
      const cash = savedCash?.amount > 0
        ? { amount: savedCash.amount, currency: savedCash.currency ?? 'USD' }
        : cashRow ? { amount: cashRow.amount, currency: cashRow.currency ?? 'USD' } : undefined;

      const res  = await fetch('/api/stock-quick-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ticker,
          prompt,
          price: quote?.price,
          chgPct: quote?.chgPct,
          // Only attach portfolio context when the user actually holds equities.
          ...(equities.length ? { holdings: equities, ...(cash ? { cash } : {}) } : {}),
        }),
      });
      const json = await res.json();
      setQuickResult({ prompt, response: json.response ?? json.error ?? 'No response' });
    } catch {
      setQuickResult({ prompt, response: 'Network error.' });
    }
    setQuickLoading(false);
  }

  // ── EMPTY STATE ──
  if (!thesis && !loading) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', gap: 10, textAlign: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>
            AI THESIS · POWERED BY CLAUDE OPUS 4.8
          </span>
          <button
            onClick={() => generate()}
            disabled={limitReached}
            style={{
              background:    limitReached ? 'var(--bg-secondary)' : 'var(--accent)',
              color:         limitReached ? 'var(--text-muted)' : '#fff',
              border:        'none', borderRadius: 7, padding: '10px 24px',
              fontSize: 13, fontWeight: 700, cursor: limitReached ? 'not-allowed' : 'pointer',
            }}
          >
            {limitReached ? 'Daily limit reached' : 'Generate AI Thesis'}
          </button>
          {!limitReached && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Claude analyzes {ticker} over a 3-year horizon
            </span>
          )}
          {error && <span style={{ fontSize: 12, color: 'var(--negative)' }}>{error}</span>}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {usageCount}/{LIMIT} used today
          </span>
        </div>
      </Card>
    );
  }

  // ── LOADING STATE ──
  if (loading) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13, gap: 10 }}>
          <span className="dot dot-loading" />
          Generating {ticker} thesis… (3-year horizon)
        </div>
      </Card>
    );
  }

  // ── GENERATED STATE ──
  const rc = ratingColor(thesis.rating);

  return (
    <>
      <Card>
        {/* Header: eyebrow + regenerate */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Claude Thesis · Opus 4.8 · 3-year horizon
            {generatedAt ? ` · ${generatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ' · cached'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{usageCount}/{LIMIT} today</span>
            <button
              onClick={() => generate(true)}
              disabled={limitReached}
              style={{
                background: 'none', border: '1px solid var(--border-color)', borderRadius: 5,
                color: 'var(--text-secondary)', fontSize: 11, cursor: limitReached ? 'not-allowed' : 'pointer',
                padding: '3px 10px', fontWeight: 600, opacity: limitReached ? 0.5 : 1,
              }}
            >↻ Regenerate</button>
          </div>
        </div>

        {/* 2-column layout */}
        <div className="thesis-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* LEFT PANE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Rating + pill */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: rc, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {thesis.rating}
              </span>
              <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>/10</span>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                background: rc + '22', color: rc,
                border: `1px solid ${rc}55`, borderRadius: 20, padding: '2px 10px',
              }}>
                {ratingLabel(thesis.rating)} · 3y
              </span>
            </div>

            {/* One-liner */}
            {thesis.oneLiner && (
              <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                {thesis.oneLiner}
              </p>
            )}

            {/* Portfolio callout (signed-in + has holdings + fitsPortfolio) */}
            {isSignedIn && thesis.fitsPortfolio && (
              <div style={{
                background: 'var(--bg-hover)', border: '1px solid var(--accent)',
                borderRadius: 6, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>
                  For your portfolio
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {thesis.fitsPortfolio}
                </p>
              </div>
            )}

            {/* 3-year target bar */}
            {thesis.threeYearTarget && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                  3-Year Price Targets
                </div>
                <PriceBar
                  bear={thesis.threeYearTarget.bear}
                  base={thesis.threeYearTarget.base}
                  bull={thesis.threeYearTarget.bull}
                  current={quote?.price}
                />
              </div>
            )}

            {/* Quick-action chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => fireQuickAction(chip)}
                  disabled={limitReached || quickLoading}
                  style={{
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    borderRadius: 20, padding: '4px 12px', fontSize: 11, color: 'var(--text-secondary)',
                    cursor: limitReached || quickLoading ? 'not-allowed' : 'pointer',
                    opacity: limitReached ? 0.5 : 1, fontWeight: 500,
                  }}
                >
                  ✨ {chip}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT PANE — Bull / Bear / Risks tabs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
              {['bull', 'bear', 'risks'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '.05em',
                    background: activeTab === tab ? 'var(--bg-hover)' : 'transparent',
                    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: 'none', borderRight: tab !== 'risks' ? '1px solid var(--border-color)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {tab === 'bull' ? '▲ Bull' : tab === 'bear' ? '▼ Bear' : '⚠ Risks'}
                </button>
              ))}
            </div>
            <BulletList items={
              activeTab === 'bull'  ? (thesis.bull  ?? []) :
              activeTab === 'bear'  ? (thesis.bear  ?? []) :
              (thesis.risks ?? [])
            } />
          </div>
        </div>
      </Card>

      {/* Quick-action inline response card */}
      {quickResult && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--accent-cyan)', marginBottom: 6 }}>
                ✨ {quickResult.prompt}
              </div>
              {quickLoading ? (
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generating…</span>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {quickResult.response}
                </p>
              )}
            </div>
            <button
              onClick={() => setQuickResult(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}
            >✕</button>
          </div>
        </Card>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 4 — EARNINGS CARD
// ─────────────────────────────────────────────────────────────

function BeatPill({ actual, estimate, label }) {
  if (actual == null || estimate == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const beat = actual >= estimate;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 20,
      background: beat ? 'var(--positive-soft)22' : 'var(--negative-soft)22',
      color:      beat ? 'var(--positive-soft)'   : 'var(--negative-soft)',
      border:     '1px solid ' + (beat ? 'var(--positive-soft)55' : 'var(--negative-soft)55'),
    }}>
      {beat ? 'BEAT' : 'MISS'}
    </span>
  );
}

function EarningsCard({ ticker }) {
  const [history,     setHistory]     = useState(null);
  const [nextEarning, setNextEarning] = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setHistory(null);
    setNextEarning(null);
    Promise.all([
      fetch(`/api/earnings-history?symbol=${ticker}`).then(r => r.json()).catch(() => []),
      fetch(`/api/earnings?tickers=${ticker}`).then(r => r.json()).catch(() => []),
    ]).then(([hist, nextArr]) => {
      setHistory(Array.isArray(hist) ? hist.slice(-8).reverse() : []);
      const next = Array.isArray(nextArr) ? nextArr.find(e => !e.noData) : null;
      setNextEarning(next ?? null);
    }).finally(() => setLoading(false));
  }, [ticker]);

  // Days until next earnings
  const daysAway = nextEarning?.date
    ? Math.round((new Date(nextEarning.date) - new Date()) / 86400000)
    : null;
  const showBanner = nextEarning && daysAway != null && daysAway <= 120;

  if (loading) return <Card title="Earnings"><PlaceholderBody label="Loading…" /></Card>;

  return (
    <Card title="Earnings" eyebrow={ticker}>
      {/* Next Earnings Banner */}
      {showBanner && (
        <div style={{
          background: 'var(--warn)15', border: '1px solid var(--warn)50',
          borderRadius: 6, padding: '8px 12px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          fontSize: 12, color: 'var(--text-primary)',
        }}>
          <span style={{ color: 'var(--warn)', fontWeight: 700 }}>⏳ Next earnings</span>
          <span>{nextEarning.date}</span>
          <span style={{ color: 'var(--text-muted)' }}>· {daysAway}d away</span>
          {nextEarning.hour && <span style={{ color: 'var(--text-muted)' }}>· {nextEarning.hour}</span>}
          {nextEarning.epsEstimate != null && (
            <span style={{ color: 'var(--text-muted)' }}>· Est EPS ${nextEarning.epsEstimate.toFixed(2)}</span>
          )}
        </div>
      )}

      {/* 8-Quarter Table */}
      {(!history || history.length === 0) ? (
        <PlaceholderBody label="No earnings history available" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Quarter', 'Date', 'Rev Est', 'Rev Act', 'Rev', 'EPS Est', 'EPS Act', 'EPS', 'Guide Est', 'Guide Act', 'Guide'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Quarter' || h === 'Date' ? 'left' : 'right',
                    fontSize: 9, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase',
                    color: 'var(--text-muted)', padding: '6px 8px', borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((row, i) => {
                const fmtRev = v => v != null ? '$' + (v / 1e9).toFixed(2) + 'B' : '—';
                const fmtEps = v => v != null ? '$' + v.toFixed(2) : '—';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {row.displayQuarter}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {row.period?.slice(0, 10) ?? '—'}
                    </td>
                    {/* Revenue */}
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtRev(row.revenueEstimate)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-primary)',   fontVariantNumeric: 'tabular-nums' }}>{fmtRev(row.revenueActual)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}><BeatPill actual={row.revenueActual} estimate={row.revenueEstimate} /></td>
                    {/* EPS */}
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtEps(row.estimate)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-primary)',   fontVariantNumeric: 'tabular-nums' }}>{fmtEps(row.actual)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}><BeatPill actual={row.actual} estimate={row.estimate} /></td>
                    {/* Guidance — not available from this API */}
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
            Guidance columns not yet available from /api/earnings-history (no upstream guidance data).
          </p>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 5 — DCF CALCULATOR
// ─────────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step, onChange, unit = '%', help }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>
          {label}
          {help && (
            <InfoTooltip text={help} style={{ flex: '0 0 auto', display: 'inline-flex', marginLeft: 6 }} boxStyle={{ width: 260 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, cursor: 'help' }}>ⓘ</span>
            </InfoTooltip>
          )}
        </span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

// Clamp + round helpers for each slider (keeps AI values within UI bounds)
function clampWacc(v)   { return Math.min(18, Math.max(4,  Math.round(v * 2) / 2)); }  // step 0.5
function clampTg(v)     { return Math.min(5,  Math.max(1,  Math.round(v * 4) / 4)); }  // step 0.25
function clampCagr(v)   { return Math.min(60, Math.max(0,  Math.round(v)));          }  // step 1
function clampMargin(v) { return Math.min(80, Math.max(5,  Math.round(v)));          }  // step 1

function DCFCalculator({ ticker, financials, metrics, quote, aiScenarios, resolvedRevenue }) {
  const [wacc,           setWacc]           = useState(DCF_DEFAULTS.wacc);
  const [terminalGrowth, setTerminalGrowth] = useState(DCF_DEFAULTS.terminalGrowth);
  const [revenueCagr,    setRevenueCagr]    = useState(DCF_DEFAULTS.revenueCagr);
  const [terminalMargin, setTerminalMargin] = useState(DCF_DEFAULTS.terminalMargin);
  const [activePreset,   setActivePreset]   = useState('consensus');
  const [isCustomized,   setIsCustomized]   = useState(false);
  // Ref: true once user manually moves a slider (resets on ticker change or preset click)
  const userTouched = useRef(false);

  // Reset everything on ticker change
  useEffect(() => {
    userTouched.current = false;
    setIsCustomized(false);
    setActivePreset('consensus');
    setWacc(DCF_DEFAULTS.wacc);
    setTerminalGrowth(DCF_DEFAULTS.terminalGrowth);
    setRevenueCagr(DCF_DEFAULTS.revenueCagr);
    setTerminalMargin(DCF_DEFAULTS.terminalMargin);
  }, [ticker]);

  // Auto-populate when AI scenarios arrive or active preset changes (skips if user touched)
  useEffect(() => {
    if (!aiScenarios || userTouched.current) return;
    const p = aiScenarios[activePreset];
    if (!p) return;
    setWacc(clampWacc(p.wacc));
    setTerminalGrowth(clampTg(p.terminalGrowth));
    setRevenueCagr(clampCagr(p.revenueCagr));
    setTerminalMargin(clampMargin(p.terminalMargin));
  }, [aiScenarios, activePreset]);

  // Wrap each setter to mark user-touched + isCustomized on first manual interaction
  function handleSlider(setter) {
    return (v) => { userTouched.current = true; setIsCustomized(true); setter(v); };
  }

  // Preset click: reset touch flag, switch preset, let effect populate sliders
  function selectPreset(preset) {
    userTouched.current = false;
    setIsCustomized(false);
    setActivePreset(preset);
  }

  // Derive inputs: prefer resolvedRevenue waterfall (EDGAR annual or TTM fallback)
  const lastRevenue   = resolvedRevenue?.value ?? null;
  const revenueSource = resolvedRevenue?.source ?? null;
  // Shares outstanding: marketCap (Finnhub millions) / price
  const marketCapUSD = metrics?.marketCap != null ? metrics.marketCap * 1e6 : null;
  const sharesOut    = marketCapUSD && quote?.price ? marketCapUSD / quote.price : null;

  const dcf = (lastRevenue && sharesOut)
    ? calcDCF({ lastRevenue, wacc, terminalGrowth, revenueCagr, terminalMargin, sharesOut, netDebt: 0 })
    : null;

  const noData       = !lastRevenue || !sharesOut;
  const presetLabel  = activePreset.charAt(0).toUpperCase() + activePreset.slice(1);
  const footerPrefix = aiScenarios
    ? (isCustomized
        ? `DCF assumes (customized from ${presetLabel} for ${ticker}):`
        : `DCF assumes (${presetLabel} AI-tuned for ${ticker}):`)
    : 'DCF assumes:';

  return (
    <Card
      title="DCF Calculator"
      eyebrow={ticker}
      action={
        <div style={{ display: 'flex', gap: 4 }}>
          {['conservative', 'consensus', 'bull'].map(preset => {
            const label    = preset.charAt(0).toUpperCase() + preset.slice(1);
            const isActive = activePreset === preset;
            const hasData  = !!aiScenarios?.[preset];
            return (
              <button
                key={preset}
                onClick={() => hasData && selectPreset(preset)}
                disabled={!hasData}
                title={!hasData ? 'Regenerate thesis to unlock' : undefined}
                style={{
                  background:   isActive ? 'var(--bg-hover)' : 'transparent',
                  border:       '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border-color)'),
                  color:        isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: 10, padding: '2px 7px', borderRadius: 4,
                  cursor:     hasData ? 'pointer' : 'not-allowed',
                  fontWeight: 500, opacity: hasData ? 1 : 0.4,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      }
      footer={dcf ? `${footerPrefix} 5-year projection · ${wacc}% WACC · ${terminalGrowth}% terminal growth · ${revenueCagr}% revenue CAGR · ${terminalMargin}% terminal op margin. Net debt assumed $0 (not available from EDGAR). Sensitivity bands are ±20% around base.` : undefined}
    >
      {noData ? (
        <PlaceholderBody label={`Financial data not available for ${ticker} — DCF requires annual revenue from EDGAR`} height={140} />
      ) : (
        <div className="dcf-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* Sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Active preset rationale caption — dims when user has customized sliders */}
            {aiScenarios?.[activePreset]?.rationale && (
              <p style={{
                fontSize: 11, fontStyle: 'italic', margin: 0, lineHeight: 1.5,
                color:   isCustomized ? 'var(--text-muted)' : 'var(--text-secondary)',
                opacity: isCustomized ? 0.5 : 1,
                transition: 'opacity .2s',
              }}>
                ✨ {aiScenarios[activePreset].rationale}
              </p>
            )}
            <Slider label="WACC"               value={wacc}           min={4}  max={18} step={0.5}  onChange={handleSlider(setWacc)} help={
              <>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>WACC (Weighted Average Cost of Capital)</div>
                <div>The yearly return a company must earn to satisfy both its lenders and shareholders. In a DCF it's the discount rate — it shrinks future cash to what it's worth today. A riskier company has a higher WACC, which lowers the valuation.</div>
              </>
            } />
            <Slider label="Terminal Growth"    value={terminalGrowth} min={1}  max={5}  step={0.25} onChange={handleSlider(setTerminalGrowth)} help={
              <>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Terminal Growth</div>
                <div>The slow, steady rate you assume the company grows at forever, after the detailed forecast ends. Usually kept near long-run economic growth (about 2–3%), since nothing outgrows the economy indefinitely. Small changes here move the valuation a lot.</div>
              </>
            } />
            <Slider label="Revenue CAGR"       value={revenueCagr}    min={0}  max={60} step={1}    onChange={handleSlider(setRevenueCagr)} help={
              <>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Revenue CAGR</div>
                <div>The average yearly rate you expect revenue to grow over the forecast period, smoothed into one steady percentage — the single rate that, compounded each year, takes revenue from today's level to the end of the forecast.</div>
              </>
            } />
            <Slider label="Terminal Op Margin" value={terminalMargin} min={5}  max={80} step={1}    onChange={handleSlider(setTerminalMargin)} help={
              <>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Terminal Operating Margin</div>
                <div>The operating profit the company keeps from each dollar of sales once it's mature (operating income ÷ revenue). A higher margin means more of every sale becomes profit, which lifts the valuation.</div>
              </>
            } />
          </div>

          {/* DCF result */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {dcf ? (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                    DCF Fair Value
                  </div>
                  <div style={{
                    fontSize: 36, fontWeight: 800, color: 'var(--accent)',
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em',
                  }}>
                    {fmtDollars(dcf.fairValue)}
                  </div>
                  {quote?.price && (
                    <div style={{ fontSize: 12, color: dcf.fairValue > quote.price ? 'var(--positive)' : 'var(--negative)', marginTop: 4, fontWeight: 600 }}>
                      {dcf.fairValue > quote.price ? '+' : ''}{(((dcf.fairValue - quote.price) / quote.price) * 100).toFixed(1)}% vs current
                    </div>
                  )}
                </div>
                <PriceBar bear={dcf.bear} base={dcf.base} bull={dcf.bull} current={quote?.price} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Based on ${(lastRevenue / 1e9).toFixed(1)}B revenue
                  {revenueSource ? ` · ${revenueSource}` : ''}
                </div>
              </>
            ) : (
              <PlaceholderBody label="Adjust sliders to calculate" height={120} />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 6 — ANALYST RATINGS CARD
// ─────────────────────────────────────────────────────────────

function AnalystRatingsCard({ ticker, data, currentPrice }) {
  if (!data) {
    return (
      <Card title="Analyst Ratings" eyebrow={ticker}>
        <PlaceholderBody label="Loading analyst data…" />
      </Card>
    );
  }

  const { consensus, priceTarget, recentChanges } = data;
  const total = consensus
    ? (consensus.strongBuy + consensus.buy + consensus.hold + consensus.sell + consensus.strongSell)
    : 0;
  const pct = total > 0 ? v => Math.round((v / total) * 100) : () => 0;

  const ptLow  = priceTarget?.low;
  const ptMean = priceTarget?.mean;
  const ptHigh = priceTarget?.high;
  const hasTarget = ptLow != null && ptHigh != null;
  const ptRangeMin = hasTarget ? Math.min(ptLow, currentPrice ?? ptLow) * 0.9 : 0;
  const ptRangeMax = hasTarget ? Math.max(ptHigh, currentPrice ?? ptHigh) * 1.1 : 1;
  const ptSpan = ptRangeMax - ptRangeMin || 1;
  const ptPos  = v => v != null ? Math.max(0, Math.min(100, ((v - ptRangeMin) / ptSpan) * 100)) : null;

  function actionColor(action) {
    if (!action) return 'var(--text-muted)';
    const a = action.toLowerCase();
    if (a === 'upgrade' || a === 'initiated' || a === 'buy') return 'var(--positive)';
    if (a === 'downgrade' || a === 'sell') return 'var(--negative)';
    return 'var(--text-secondary)';
  }

  return (
    <Card title="Analyst Ratings" eyebrow={ticker}>
      {/* Stacked recommendation bar */}
      {consensus && total > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Bullish</span>
            <span>{total} analysts · {consensus.period}</span>
            <span>Bearish</span>
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            {[
              { v: consensus.strongBuy,  bg: '#16a34a' },
              { v: consensus.buy,        bg: '#4ade80' },
              { v: consensus.hold,       bg: '#fbbf24' },
              { v: consensus.sell,       bg: '#f87171' },
              { v: consensus.strongSell, bg: '#dc2626' },
            ].map((seg, i) => seg.v > 0 && (
              <div key={i} style={{ flex: pct(seg.v), background: seg.bg, minWidth: 2 }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap', fontSize: 10 }}>
            {[
              { label: 'S.Buy', v: consensus.strongBuy,  color: '#16a34a' },
              { label: 'Buy',   v: consensus.buy,        color: '#4ade80' },
              { label: 'Hold',  v: consensus.hold,       color: '#fbbf24' },
              { label: 'Sell',  v: consensus.sell,       color: '#f87171' },
              { label: 'S.Sell',v: consensus.strongSell, color: '#dc2626' },
            ].map(s => (
              <span key={s.label} style={{ color: s.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {s.v} {s.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>No consensus data</div>
      )}

      {/* Avg analyst price target — prominent display */}
      {ptMean != null && (
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Avg Analyst Price Target
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>
            {fmtDollars(ptMean)}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
            {currentPrice != null ? (
              <>
                <span style={{ color: ptMean > currentPrice ? 'var(--positive)' : 'var(--negative)' }}>
                  {ptMean > currentPrice ? '+' : ''}{(((ptMean - currentPrice) / currentPrice) * 100).toFixed(1)}% {ptMean > currentPrice ? 'upside' : 'downside'}
                </span>
                {priceTarget.analysts != null && (
                  <span style={{ color: 'var(--text-muted)' }}> · {priceTarget.analysts} analysts</span>
                )}
              </>
            ) : priceTarget.analysts != null ? (
              <span style={{ color: 'var(--text-muted)' }}>based on {priceTarget.analysts} analysts</span>
            ) : null}
          </div>
        </div>
      )}

      {/* Price target range bar */}
      {hasTarget && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
            Price Target ({priceTarget.analysts} analysts)
          </div>
          <div style={{ position: 'relative', height: 6, background: 'var(--border-color)', borderRadius: 3, margin: '0 8px' }}>
            <div style={{
              position: 'absolute',
              left: ptPos(ptLow) + '%',
              width: (ptPos(ptHigh) - ptPos(ptLow)) + '%',
              height: '100%',
              background: 'var(--accent)',
              opacity: 0.35,
              borderRadius: 3,
            }} />
            {ptMean != null && (
              <div style={{ position: 'absolute', left: ptPos(ptMean) + '%', top: -4, width: 2, height: 14, background: 'var(--accent)', transform: 'translateX(-50%)', borderRadius: 1 }} />
            )}
            {currentPrice != null && (
              <div style={{ position: 'absolute', left: ptPos(currentPrice) + '%', top: -4, width: 2, height: 14, background: 'var(--text-primary)', transform: 'translateX(-50%)', borderRadius: 1 }} />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
            <span style={{ color: 'var(--text-muted)' }}>Low {fmtDollars(ptLow)}</span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Mean {fmtDollars(ptMean)}</span>
            <span style={{ color: 'var(--text-muted)' }}>High {fmtDollars(ptHigh)}</span>
          </div>
          {currentPrice != null && ptMean != null && (
            <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, marginTop: 3,
              color: ptMean > currentPrice ? 'var(--positive)' : 'var(--negative)',
            }}>
              {ptMean > currentPrice ? '+' : ''}{(((ptMean - currentPrice) / currentPrice) * 100).toFixed(1)}% upside to mean target
            </div>
          )}
        </div>
      )}

      {/* Recent rating actions */}
      {recentChanges?.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5 }}>
            Recent Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {recentChanges.slice(0, 5).map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 68 }}>{c.date}</span>
                <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{c.firm}</span>
                <span style={{ color: actionColor(c.action), fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap', fontSize: 10 }}>{c.action}</span>
                {c.to && (
                  <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', fontSize: 10 }}>
                    {c.from ? `${c.from} → ${c.to}` : c.to}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 7 — FINANCIAL STATEMENTS CARD
// ─────────────────────────────────────────────────────────────

function FinancialStatementsCard({ ticker, financials }) {
  if (!financials) {
    return (
      <Card title="Financial Statements" eyebrow={ticker}>
        <PlaceholderBody label="Loading financials…" />
      </Card>
    );
  }

  const { revenue, grossProfit, netIncome, eps, operatingIncome } = financials;
  const years = (revenue ?? []).slice(-5).map(r => r.year);

  if (!years.length) {
    return (
      <Card title="Financial Statements" eyebrow={ticker}>
        <PlaceholderBody label="No annual data available from EDGAR" />
      </Card>
    );
  }

  function getVal(arr, year) {
    return arr?.find(r => r.year === year)?.value ?? null;
  }

  function pctOf(num, denom) {
    if (num == null || denom == null || denom === 0) return null;
    return (num / denom) * 100;
  }

  function fmtB(n) {
    if (n == null) return '—';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(0) + 'M';
    return sign + '$' + abs.toFixed(0);
  }

  function fmtMgn(n) { return n == null ? '—' : n.toFixed(1) + '%'; }
  function fmtEpsV(n) { return n == null ? '—' : '$' + n.toFixed(2); }

  function YoYBadge({ curr, prev, isPct }) {
    if (curr == null || prev == null || (isPct ? false : prev === 0)) return null;
    const delta = isPct ? (curr - prev) : ((curr - prev) / Math.abs(prev)) * 100;
    return (
      <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 3, color: delta >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
        {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%
      </span>
    );
  }

  const rows = [
    { label: 'Revenue',      values: years.map(y => getVal(revenue, y)),                               fmt: fmtB    },
    { label: 'Gross Profit', values: years.map(y => getVal(grossProfit, y)),                           fmt: fmtB    },
    { label: 'Gross Margin', values: years.map(y => pctOf(getVal(grossProfit, y), getVal(revenue, y))),fmt: fmtMgn, isPct: true },
    { label: 'Op Income',    values: years.map(y => getVal(operatingIncome, y)),                       fmt: fmtB    },
    { label: 'Net Income',   values: years.map(y => getVal(netIncome, y)),                             fmt: fmtB    },
    { label: 'Net Margin',   values: years.map(y => pctOf(getVal(netIncome, y), getVal(revenue, y))), fmt: fmtMgn, isPct: true },
    { label: 'EPS (Diluted)',values: years.map(y => getVal(eps, y)),                                   fmt: fmtEpsV },
  ];

  return (
    <Card title="Financial Statements" eyebrow={ticker}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 9, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '5px 8px 5px 0', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Metric</th>
              {years.map(y => (
                <th key={y} style={{ textAlign: 'right', fontSize: 9, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '5px 8px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', whiteSpace: 'nowrap' }}>FY{y.slice(-2)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '7px 8px 7px 0', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.label}</td>
                {row.values.map((v, vi) => (
                  <td key={vi} style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {row.fmt(v)}
                    {vi > 0 && <YoYBadge curr={v} prev={row.values[vi - 1]} isPct={!!row.isPct} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
        Source: SEC EDGAR annual filings (10-K)
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 8 — VALUATION METRICS CARD
// ─────────────────────────────────────────────────────────────

function ValuationMetricsCard({ ticker, metrics, valHistory }) {
  const [peerMetrics, setPeerMetrics] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    setPeerMetrics(null);
    fetch(`/api/peers?tickers=${ticker}`)
      .then(r => r.json())
      .then(data => setPeerMetrics(Array.isArray(data) ? data.filter(p => p.ticker !== ticker) : []))
      .catch(() => setPeerMetrics([]));
  }, [ticker]);

  function peerMedian(field) {
    if (!peerMetrics?.length) return null;
    const vals = peerMetrics.map(p => p[field]).filter(v => v != null && isFinite(v) && v > 0).sort((a, b) => a - b);
    if (!vals.length) return null;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  }

  function fmtMult(v) { return v != null && isFinite(v) && v > 0 ? v.toFixed(1) + 'x' : '—'; }
  function fmtPctV(v) { return v != null && isFinite(v)          ? v.toFixed(1) + '%' : '—'; }

  function VsPeersCell({ current, median, higher = 'bad' }) {
    if (current == null || median == null || median === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    const delta = ((current - median) / median) * 100;
    const isPositive = delta > 0;
    // For margins/ROE, higher is good. For multiples, higher = premium = neutral-to-bad.
    const color = higher === 'good'
      ? (isPositive ? 'var(--positive)' : 'var(--negative)')
      : (isPositive ? 'var(--warn)' : 'var(--positive)');
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
        background: color + '22', color, whiteSpace: 'nowrap' }}>
        {isPositive ? '+' : ''}{delta.toFixed(1)}%
      </span>
    );
  }

  const avg = valHistory?.averages ?? {};
  const cur = metrics ?? {};
  const loading = peerMetrics === null;

  const ROWS = [
    { label: 'P/E (TTM)',    cur: cur.peRatio,    avg: avg.pe,          peer: peerMedian('peRatio'),    fmt: fmtMult, higher: 'neutral' },
    { label: 'Fwd P/E',     cur: cur.forwardPE,  avg: null,            peer: peerMedian('forwardPE'),  fmt: fmtMult, higher: 'neutral' },
    { label: 'P/S',         cur: cur.psRatio,    avg: avg.ps,          peer: peerMedian('psRatio'),    fmt: fmtMult, higher: 'neutral' },
    { label: 'P/B',         cur: cur.pbRatio,    avg: avg.pb,          peer: peerMedian('pbRatio'),    fmt: fmtMult, higher: 'neutral' },
    { label: 'EV/EBITDA',   cur: cur.evEbitda,   avg: avg.evEbitda,    peer: peerMedian('evEbitda'),   fmt: fmtMult, higher: 'neutral' },
    { label: 'Net Margin',  cur: cur.netMargin,  avg: avg.netMargin,   peer: peerMedian('netMargin'),  fmt: fmtPctV, higher: 'good'    },
    { label: 'Gross Margin',cur: cur.grossMargin,avg: avg.grossMargin, peer: peerMedian('grossMargin'),fmt: fmtPctV, higher: 'good'    },
    { label: 'ROE',         cur: cur.roe,        avg: avg.roe,         peer: peerMedian('roe'),        fmt: fmtPctV, higher: 'good'    },
  ];

  return (
    <Card title="Valuation Metrics" eyebrow={ticker}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Metric', 'Current', '5yr Avg', 'Peer Med.', 'vs Peers'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 9, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '5px 8px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.label} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '7px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.label}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{row.fmt(row.cur)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {valHistory ? row.fmt(row.avg) : '—'}
                </td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '…' : row.fmt(row.peer)}
                </td>
                <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                  {loading ? <span style={{ color: 'var(--text-muted)' }}>…</span>
                    : <VsPeersCell current={row.cur} median={row.peer} higher={row.higher} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
        5yr avg: FMP ratios · Peer median: Finnhub sector peers
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 9 — INSIDER TRADING CARD
// ─────────────────────────────────────────────────────────────

const INSIDER_CODES = {
  P: { label: 'Purchase',        color: '#16a34a' },
  S: { label: 'Sale',            color: '#dc2626' },
  A: { label: 'Award',           color: '#2563eb' },
  M: { label: 'Option Exercise', color: '#7c3aed' },
  X: { label: 'Exercise',        color: '#7c3aed' },
  F: { label: 'Tax Withhold',    color: '#d97706' },
  D: { label: 'Disposition',     color: '#d97706' },
};

function InsiderTradingCard({ ticker }) {
  const [transactions, setTransactions] = useState(null); // null = loading
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setTransactions(null);
    setError(false);
    fetch(`/api/insider?tickers=${ticker}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTransactions(data);
        else { setTransactions([]); setError(true); }
      })
      .catch(() => { setTransactions([]); setError(true); });
  }, [ticker]);

  if (transactions === null) {
    return <Card title="Insider Trading" eyebrow={ticker}><PlaceholderBody label="Loading insider activity…" /></Card>;
  }

  if (error) {
    return <Card title="Insider Trading" eyebrow={ticker}><PlaceholderBody label="Insider data unavailable." /></Card>;
  }

  if (transactions.length === 0) {
    return <Card title="Insider Trading" eyebrow={ticker}><PlaceholderBody label={`No recent insider activity for ${ticker}.`} /></Card>;
  }

  // Summary computation
  const buys  = transactions.filter(t => t.transactionCode === 'P');
  const sells = transactions.filter(t => t.transactionCode === 'S');
  const other = transactions.filter(t => t.transactionCode !== 'P' && t.transactionCode !== 'S');
  const hasOpenMarket = buys.length > 0 || sells.length > 0;

  const netValue = transactions.reduce((sum, t) => {
    const sign = t.transactionCode === 'P' ? 1 : -1;
    return sum + sign * Math.abs((t.change ?? 0) * (t.transactionPrice ?? 0));
  }, 0);

  const dates = transactions.map(t => t.transactionDate).filter(Boolean).sort();

  function fmtShortDate(s) {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function fmtAmt(v) {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'K';
    return sign + '$' + abs.toFixed(0);
  }

  const dateRange = dates.length
    ? fmtShortDate(dates[0]) + (dates.length > 1 ? ' – ' + fmtShortDate(dates[dates.length - 1]) : '')
    : '';

  return (
    <Card title="Insider Trading" eyebrow={ticker}>
      {/* Summary strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10, fontSize: 11 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{dateRange}</span>
        {hasOpenMarket ? (
          <>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            {buys.length > 0 && (
              <span style={{ color: 'var(--positive)', fontWeight: 700 }}>{buys.length} buy{buys.length !== 1 ? 's' : ''}</span>
            )}
            {buys.length > 0 && sells.length > 0 && <span style={{ color: 'var(--text-muted)' }}>·</span>}
            {sells.length > 0 && (
              <span style={{ color: 'var(--negative)', fontWeight: 700 }}>{sells.length} sell{sells.length !== 1 ? 's' : ''}</span>
            )}
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ fontWeight: 700, color: netValue >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
              Net {netValue >= 0 ? '+' : ''}{fmtAmt(netValue)}
            </span>
          </>
        ) : (
          <>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {other.length} exercise{other.length !== 1 ? 's' : ''}/award{other.length !== 1 ? 's' : ''} · No open-market activity
            </span>
          </>
        )}
      </div>

      {/* Transaction table */}
      <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['Date', 'Insider', 'Type', 'Shares', 'Price', 'Value'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i < 2 ? 'left' : 'right',
                  fontSize: 9, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase',
                  color: 'var(--text-muted)', padding: '4px 6px',
                  borderBottom: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)', whiteSpace: 'nowrap',
                  position: 'sticky', top: 0,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.slice(0, 10).map((t, i) => {
              const code   = INSIDER_CODES[t.transactionCode];
              const isBuy  = t.transactionCode === 'P';
              const isSell = t.transactionCode === 'S';
              const value  = Math.abs((t.change ?? 0) * (t.transactionPrice ?? 0));
              const name   = t.name?.length > 22 ? t.name.slice(0, 20) + '…' : (t.name ?? '—');
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '6px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {t.transactionDate ? fmtShortDate(t.transactionDate) : '—'}
                  </td>
                  <td style={{ padding: '6px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {name}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>
                    <span style={{
                      background: (code?.color ?? '#6b7280') + '22',
                      color:      code?.color ?? '#6b7280',
                      border:     `1px solid ${(code?.color ?? '#6b7280')}55`,
                      borderRadius: 3, padding: '1px 5px',
                      fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
                    }}>
                      {code?.label ?? t.transactionCode}
                    </span>
                  </td>
                  <td style={{
                    padding: '6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: isBuy ? 'var(--positive)' : isSell ? 'var(--negative)' : 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                  }}>
                    {t.change != null ? (t.change > 0 ? '+' : '') + t.change.toLocaleString('en-US') : '—'}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {t.transactionPrice ? '$' + t.transactionPrice.toFixed(2) : '—'}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {value > 0 ? fmtAmt(value) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {transactions.length > 10 && (
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
          Showing 10 of {transactions.length} transactions
        </p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 10 — INSTITUTIONAL OWNERSHIP CARD
// ─────────────────────────────────────────────────────────────

function InstitutionalOwnershipCard({ ticker }) {
  const [data,    setData]    = useState(null);  // null = loading, false = unavailable, obj = loaded
  const [loading, setLoading] = useState(true);
  const [retry,   setRetry]   = useState(0);

  useEffect(() => {
    if (!ticker) return;
    setData(null);
    setLoading(true);
    fetch(`/api/institutional?tickers=${ticker}`)
      .then(r => r.json())
      .then(arr => setData(Array.isArray(arr) && arr[0] ? arr[0] : false))
      .catch(() => setData(false))
      .finally(() => setLoading(false));
  }, [ticker, retry]);

  if (loading) {
    return <Card title="Institutional Ownership" eyebrow={ticker}><PlaceholderBody label="Loading 13F filings…" /></Card>;
  }

  if (!data || data.institutionsPctHeld === null) {
    return (
      <Card title="Institutional Ownership" eyebrow={ticker}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Institutional data unavailable</div>
          <button
            onClick={() => setRetry(r => r + 1)}
            style={{
              fontSize: 11, color: 'var(--accent)', background: 'none',
              border: '1px solid var(--accent)', borderRadius: 4,
              padding: '3px 12px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Retry</button>
        </div>
      </Card>
    );
  }

  function fmtPct(n) { return n == null ? '—' : (n * 100).toFixed(1) + '%'; }
  function fmtB(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
    return '$' + n.toFixed(0);
  }

  const statStyle = {
    flex: 1, padding: '10px 12px',
    borderLeft: '1px solid var(--border-color)',
  };

  return (
    <Card title="Institutional Ownership" eyebrow={ticker}>
      {/* 3-stat strip */}
      <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ flex: 1, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Inst. Own</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(data.institutionsPctHeld)}</div>
        </div>
        <div style={statStyle}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Insider Own</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(data.insidersPctHeld)}</div>
        </div>
        <div style={statStyle}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Filers</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {data.institutionsCount?.toLocaleString('en-US') ?? '—'}
          </div>
        </div>
      </div>

      {/* Top 5 holders */}
      {data.top5?.length > 0 && (
        <>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Top Holders
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {data.top5.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, minWidth: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.name}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {fmtPct(h.pctHeld)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {fmtB(h.value)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10 }}>
        Source: Yahoo Finance 13F filings. Shares column not reported by Yahoo.
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 11 — SHORT INTEREST CARD
// ─────────────────────────────────────────────────────────────

function ShortInterestCard({ ticker }) {
  const [data,    setData]    = useState(null);  // null = loading, false = unavailable, obj = loaded
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    setData(null);
    setLoading(true);
    fetch(`/api/short-interest-data?tickers=${ticker}`)
      .then(r => r.json())
      .then(arr => setData(Array.isArray(arr) && arr[0] ? arr[0] : false))
      .catch(() => setData(false))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return <Card title="Short Interest" eyebrow={ticker}><PlaceholderBody label="Loading short interest…" /></Card>;
  }

  if (!data || data.shortPercentOfFloat === null) {
    return <Card title="Short Interest" eyebrow={ticker}><PlaceholderBody label="Short interest data unavailable." /></Card>;
  }

  const siPct   = (data.shortPercentOfFloat ?? 0) * 100;
  const siColor = siPct < 2 ? 'var(--positive)' : siPct < 5 ? 'var(--text-primary)' : siPct < 10 ? 'var(--warn)' : 'var(--negative)';
  const momColor = data.siChange == null ? 'var(--text-muted)' : data.siChange > 0 ? 'var(--warn)' : 'var(--positive)';

  function fmtM(n) { return n == null ? '—' : (n / 1e6).toFixed(1) + 'M'; }

  const statBorder = { flex: 1, padding: '10px 12px', borderLeft: '1px solid var(--border-color)' };

  return (
    <Card title="Short Interest" eyebrow={ticker}>
      {/* 3-stat strip */}
      <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ flex: 1, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Short % Float</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: siColor, fontVariantNumeric: 'tabular-nums' }}>{siPct.toFixed(2)}%</div>
        </div>
        <div style={statBorder}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Days to Cover</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {data.shortRatio != null ? data.shortRatio.toFixed(2) : '—'}
          </div>
        </div>
        <div style={statBorder}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>MoM Change</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: momColor, fontVariantNumeric: 'tabular-nums' }}>
            {data.siChange != null ? (data.siChange > 0 ? '+' : '') + data.siChange.toFixed(1) + '%' : '—'}
          </div>
        </div>
      </div>

      {/* Detail row */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
        {[
          { label: 'Shares Short',  value: fmtM(data.sharesShort)           },
          { label: 'Prior Month',   value: fmtM(data.sharesShortPriorMonth)  },
          { label: 'As of',         value: data.lastUpdated ?? '—'           },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text-secondary)' }}>{s.value}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10 }}>
        Short interest is settlement-date lagged (~2 weeks).
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 12 — PEER COMPARISON CARD
// ─────────────────────────────────────────────────────────────

const PEER_METRICS = [
  { key: 'marketCap',     label: 'Market Cap',  fmt: v => fmtCap(v),                                lowerIsBetter: false },
  { key: 'revenueGrowth', label: 'Rev Growth',  fmt: v => v == null ? '—' : v.toFixed(1) + '%',    lowerIsBetter: false },
  { key: 'peRatio',       label: 'P/E TTM',     fmt: v => fmtRatio(v),                              lowerIsBetter: true  },
  { key: 'psRatio',       label: 'P/S',         fmt: v => fmtRatio(v),                              lowerIsBetter: true  },
  { key: 'netMargin',     label: 'Net Margin',  fmt: v => v == null ? '—' : v.toFixed(1) + '%',    lowerIsBetter: false },
  { key: 'roe',           label: 'ROE',         fmt: v => v == null ? '—' : v.toFixed(1) + '%',    lowerIsBetter: false },
];

function PeerComparisonCard({ ticker, overlayPeers, setOverlayPeers }) {
  const router = useRouter();
  const [peers, setPeers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setPeers(null);
    setLoading(true);
    setError(false);
    fetch(`/api/peers?ticker=${ticker}`)
      .then(r => r.json())
      .then(data => setPeers(Array.isArray(data) && data.length ? data : null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return <Card title="Peer Comparison" eyebrow={ticker}><PlaceholderBody label="Loading peer data…" /></Card>;
  if (error)   return <Card title="Peer Comparison" eyebrow={ticker}><PlaceholderBody label="Peer data unavailable." /></Card>;
  if (!peers)  return <Card title="Peer Comparison" eyebrow={ticker}><PlaceholderBody label={`No peer data found for ${ticker}.`} /></Card>;

  const base  = peers.find(p => p.isBase) ?? peers[0];
  const peerList = peers.filter(p => !p.isBase).slice(0, 5);
  const allCols  = [base, ...peerList];

  // Best-in-class index per metric (across all columns)
  function getBestIdx(metric) {
    const vals = allCols.map(p => p[metric.key]);
    const valid = vals.filter(v => v != null && isFinite(v) && v > 0);
    if (!valid.length) return -1;
    const best = metric.lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
    return vals.findIndex(v => v === best);
  }

  return (
    <Card
      title="Peer Comparison"
      eyebrow={ticker}
      footer={<a href="/peers" style={{ color: 'var(--accent)', fontSize: 12 }}>View full peer matrix →</a>}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: 100 }}>Metric</th>
              {allCols.map((p, ci) => {
                const isBase    = p.isBase;
                const peerTick  = p.ticker;
                const isOverlay = overlayPeers.includes(peerTick);
                const slotIdx   = overlayPeers.indexOf(peerTick);
                const slotColor = isOverlay ? PEER_COLORS[slotIdx] : 'var(--accent)';
                const canToggle = isOverlay || overlayPeers.length < 3;
                return (
                  <th
                    key={peerTick}
                    style={{
                      textAlign: 'right',
                      padding: '6px 8px',
                      background: isBase ? 'color-mix(in srgb, var(--accent) 11%, transparent)' : undefined,
                      borderBottom: isBase ? '2px solid var(--accent)' : '2px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span
                        style={{ color: isBase ? 'var(--accent)' : 'var(--text-primary)', fontWeight: 600, cursor: isBase ? 'default' : 'pointer' }}
                        onClick={() => !isBase && router.push(`/research?ticker=${peerTick}`)}
                      >
                        {peerTick}
                      </span>
                      {!isBase && (
                        <button
                          onClick={() => setOverlayPeers(prev =>
                            prev.includes(peerTick)
                              ? prev.filter(t => t !== peerTick)
                              : prev.length >= 3 ? prev : [...prev, peerTick]
                          )}
                          disabled={!canToggle}
                          style={{
                            fontSize: 10,
                            padding: '1px 5px',
                            borderRadius: 4,
                            border: `1px solid ${slotColor}`,
                            background: isOverlay ? slotColor : 'transparent',
                            color: isOverlay ? '#fff' : slotColor,
                            cursor: canToggle ? 'pointer' : 'not-allowed',
                            opacity: canToggle ? 1 : 0.4,
                            lineHeight: 1.4,
                          }}
                        >
                          {isOverlay ? '✕ Overlay' : '+ Overlay'}
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PEER_METRICS.map(metric => {
              const bestIdx = getBestIdx(metric);
              return (
                <tr key={metric.key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>{metric.label}</td>
                  {allCols.map((p, ci) => {
                    const isBest   = ci === bestIdx;
                    const isBase   = p.isBase;
                    const val      = p[metric.key];
                    return (
                      <td
                        key={p.ticker}
                        style={{
                          textAlign: 'right',
                          padding: '7px 8px',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: isBest ? 700 : 400,
                          color: isBest ? 'var(--positive)' : isBase ? 'var(--text-primary)' : 'var(--text-secondary)',
                          background: isBest
                            ? 'color-mix(in srgb, var(--positive) 12%, transparent)'
                            : isBase ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined,
                        }}
                      >
                        {metric.fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSYSTEM 13 — SEC FILINGS CARD
// ─────────────────────────────────────────────────────────────

const FILING_BADGE_COLORS = {
  '10-K':    'var(--accent)',
  '10-Q':    'var(--positive)',
  '8-K':     'var(--warn)',
  'DEF 14A': '#7c3aed',
};

const SHOWN_TYPES = ['10-K', '10-Q', '8-K', 'DEF 14A'];

function fmtFilingDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SECFilingsCard({ ticker }) {
  const [filings, setFilings]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    if (!ticker) return;
    setFilings(null);
    setLoading(true);
    setError(false);
    setFilterType('all');
    fetch(`/api/research?symbol=${ticker}&type=filings`)
      .then(r => r.json())
      .then(data => setFilings(Array.isArray(data) ? data.filter(f => SHOWN_TYPES.includes(f.type)) : null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return <Card title="SEC Filings" eyebrow={ticker}><PlaceholderBody label="Loading filings…" /></Card>;
  if (error)   return <Card title="SEC Filings" eyebrow={ticker}><PlaceholderBody label="Filing data unavailable." /></Card>;
  if (!filings || !filings.length) return <Card title="SEC Filings" eyebrow={ticker}><PlaceholderBody label={`No filings found for ${ticker}.`} /></Card>;

  const typeCounts = {};
  SHOWN_TYPES.forEach(t => { typeCounts[t] = filings.filter(f => f.type === t).length; });

  const filtered = filterType === 'all' ? filings : filings.filter(f => f.type === filterType);
  const visible  = filtered.slice(0, 8);

  return (
    <Card title="SEC Filings" eyebrow={ticker}>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[{ key: 'all', label: 'All', count: filings.length }, ...SHOWN_TYPES.map(t => ({ key: t, label: t, count: typeCounts[t] }))].map(chip => {
          if (chip.key !== 'all' && chip.count === 0) return null;
          const active = filterType === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => setFilterType(chip.key)}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 99,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {chip.label}
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>{chip.count}</span>
            </button>
          );
        })}
      </div>

      {/* Filing rows */}
      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible.map((f, i) => {
          const color = FILING_BADGE_COLORS[f.type] ?? 'var(--text-muted)';
          const label = `${f.type} — ${fmtFilingDate(f.date)}`;
          return (
            <a
              key={i}
              href={f.finalLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 6,
                textDecoration: 'none',
                color: 'var(--text-primary)',
                background: 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: `color-mix(in srgb, ${color} 18%, transparent)`,
                color,
                minWidth: 48,
                textAlign: 'center',
              }}>
                {f.type}
              </span>
              <span style={{ flex: 1, fontSize: 12 }}>{label}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
            </a>
          );
        })}
      </div>

      {/* Footer */}
      {filtered.length > 8 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          Showing 8 of {filtered.length}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

function ResearchPageInner() {
  const searchParams = useSearchParams();
  const { user, isLoaded, isSignedIn } = useUser();

  const [ticker,       setTicker]       = useState(null);
  const [quote,        setQuote]        = useState(null);
  const [metrics,      setMetrics]      = useState(null);
  const [profile,      setProfile]      = useState(null);  // { sector, companyName, volAvg, image }
  const [financials,   setFinancials]   = useState(null);  // for DCF
  const [earningsHistory, setEarningsHistory] = useState([]); // for price chart markers
  const [watched,      setWatched]      = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [savedHoldings,setSavedHoldings]= useState([]);
  const [savedCash,    setSavedCash]    = useState(null);
  const [overlayPeers, setOverlayPeers] = useState([]);
  const [thesis,       setThesis]       = useState(null); // lifted from ThesisHero for DCF wiring
  const [analystRatings, setAnalystRatings] = useState(null);
  const [valHistory,   setValHistory]   = useState(null);

  // DCF scenarios: use new three-scenario shape; promote legacy dcfInputs to consensus-only
  const aiScenarios = useMemo(() => {
    if (!thesis) return null;
    if (thesis.dcfScenarios) return thesis.dcfScenarios;
    // Legacy cached thesis (pre-B2.3) has dcfInputs only — promote to consensus slot
    if (thesis.dcfInputs) return { consensus: thesis.dcfInputs };
    return null;
  }, [thesis]);

  // Waterfall-resolved revenue: EDGAR annual (Layer-2-patched) → earnings-history TTM
  const resolvedRevenue = useMemo(() => {
    const annualVal = financials?.revenue?.at(-1)?.value;
    if (annualVal) return { value: annualVal, source: 'EDGAR annual' };
    // Earnings-history TTM: sum last 4 quarters of reported revenue
    const recentQ = earningsHistory.filter(e => e.revenueActual != null).slice(-4);
    if (recentQ.length === 4) {
      const ttm = recentQ.reduce((s, e) => s + e.revenueActual, 0);
      if (ttm > 0) return { value: ttm, source: 'earnings TTM' };
    }
    return null;
  }, [financials, earningsHistory]);

  const priorAnnualRevenue = financials?.revenue?.at(-2)?.value ?? null;

  // Step 1: resolve ticker
  useEffect(() => {
    if (!isLoaded) return;
    const paramTicker = searchParams.get('ticker')?.toUpperCase();
    if (paramTicker) { setTicker(paramTicker); return; }
    if (isSignedIn && user?.id) {
      (async () => {
        try {
          const data = await fetch('/api/portfolio').then(r => r.json());
          if (data.signedIn && data.holdings?.length) {
            // Make the AI thesis + quick-action chips portfolio-aware. /api/portfolio
            // returns equities only (cash is split into data.cash) in the same
            // { t, s, c, d } shape loadUserHoldings yields, so existing savedHoldings
            // consumers need no remapping.
            setSavedHoldings(data.holdings);
            setSavedCash(data.cash ?? null); // { amount, currency } | null — matches savedCash shape
            const eq = data.holdings.filter(h => h.t !== '__CASH__');
            if (eq.length) {
              const tList = eq.map(h => h.t);
              const priceArr = await fetch(`/api/prices?tickers=${tList.join(',')}`).then(r => r.json()).catch(() => []);
              const pm = {};
              if (Array.isArray(priceArr)) priceArr.forEach(p => { pm[p.ticker] = p.price ?? 0; });
              const top = [...eq].sort((a, b) => (b.s * (pm[b.t] ?? 0)) - (a.s * (pm[a.t] ?? 0)))[0];
              if (top?.t) { setTicker(top.t); return; }
            }
          }
        } catch {}
        setTicker('NVDA');
      })();
    } else {
      setTicker('NVDA');
    }
  }, [isLoaded, isSignedIn, user?.id, searchParams]);

  // Step 2: fetch everything once ticker is known
  useEffect(() => {
    if (!ticker) return;
    setQuote(null); setMetrics(null); setProfile(null);
    setFinancials(null); setEarningsHistory([]);
    setAnalystRatings(null); setValHistory(null);
    setOverlayPeers([]);
    // Load cached thesis for this ticker (syncs to DCFCalculator via aiInputs prop)
    try {
      const cached = JSON.parse(localStorage.getItem(`research_thesis_${ticker}`));
      setThesis(cached?.rating != null ? cached : null);
    } catch { setThesis(null); }

    Promise.all([
      fetch(`/api/prices?tickers=${ticker}`).then(r => r.json()).catch(() => []),
      fetch(`/api/valuation?tickers=${ticker}`).then(r => r.json()).catch(() => []),
      fetch(`/api/sectors?tickers=${ticker}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/earnings-history?symbol=${ticker}`).then(r => r.json()).catch(() => []),
      fetch(`/api/financials?ticker=${ticker}`).then(r => r.json()).catch(() => null),
      fetch(`/api/analyst-ratings?ticker=${ticker}`).then(r => r.json()).catch(() => null),
      fetch(`/api/valuation-history?ticker=${ticker}`).then(r => r.json()).catch(() => null),
    ]).then(([priceArr, valArr, sectorMap, earnsHist, fins, analystData, valHistData]) => {
      if (Array.isArray(priceArr) && priceArr[0]) setQuote(priceArr[0]);
      if (Array.isArray(valArr)   && valArr[0])   setMetrics(valArr[0]);
      if (sectorMap?.[ticker])                    setProfile(sectorMap[ticker]);
      if (Array.isArray(earnsHist))               setEarningsHistory(earnsHist);
      if (fins && !fins.error)                    setFinancials(fins);
      if (analystData && !analystData.error)      setAnalystRatings(analystData);
      if (valHistData && !valHistData.error)      setValHistory(valHistData);
    });
  }, [ticker]);

  // Portfolio modal helpers
  function openModal() {
    const h = loadUserHoldings(user?.id) ?? [];
    setSavedHoldings(h);
    const cashAmt = parseFloat(localStorage.getItem('stockdash_cash_amount') || '0') || 0;
    const cashCcy = localStorage.getItem('stockdash_cash_currency') || 'USD';
    setSavedCash(cashAmt > 0 ? { amount: cashAmt, currency: cashCcy } : null);
    setModalOpen(true);
  }

  async function savePortfolio(holdings, cash) {
    saveUserHoldings(user?.id, holdings);
    setSavedHoldings(holdings);
    if (cash?.amount > 0) {
      localStorage.setItem('stockdash_cash_amount', String(cash.amount));
      localStorage.setItem('stockdash_cash_currency', cash.currency ?? 'USD');
    } else {
      localStorage.removeItem('stockdash_cash_amount');
      localStorage.removeItem('stockdash_cash_currency');
    }
    setSavedCash(cash?.amount > 0 ? cash : null);
    if (isSignedIn) {
      try {
        await fetch('/api/portfolio', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holdings, cash: cash?.amount > 0 ? cash : null }),
        });
      } catch {}
    }
    window.dispatchEvent(new CustomEvent('portfolio-saved'));
    setModalOpen(false);
  }

  // Derived
  const sector     = profile?.sector ?? null;
  const brandColor = sector ? (SECTOR_COLOR[sector] ?? 'var(--accent)') : 'var(--accent)';

  const STAT_STRIP = [
    { label: 'Market Cap', value: fmtCap(metrics?.marketCap) },
    { label: 'P/E (TTM)',  value: fmtRatio(metrics?.peRatio) },
    { label: 'Fwd P/E',   value: fmtRatio(metrics?.forwardPE) },
    {
      label: 'Day Range',
      value: quote?.high != null ? `${fmtCurrency(quote.low)} – ${fmtCurrency(quote.high)}` : '—',
    },
    {
      label: '52W Range',
      value: quote?.week52High != null ? `${fmtCurrency(quote.week52Low)} – ${fmtCurrency(quote.week52High)}` : '—',
    },
    { label: 'Avg Volume', value: fmtVol(profile?.volAvg) },
  ];

  if (!ticker) {
    return (
      <main style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</main>
    );
  }

  return (
    <main style={{
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14,
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>

      {/* Breadcrumbs */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <a href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</a>
        <span>›</span><span>Research</span><span>›</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ticker}</span>
      </div>

      {/* Stock header card */}
      <Card padding="18px 20px">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <LogoBug ticker={ticker} imageUrl={profile?.image} brandColor={brandColor} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', letterSpacing: '-.01em' }}>
                {ticker}
              </span>
              {profile?.companyName && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{profile.companyName}</span>
              )}
              {sector && (
                <span style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
                  color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)',
                  borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap',
                }}>{sector}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: 'var(--text-primary)', letterSpacing: '-.02em', lineHeight: 1,
            }}>
              {quote ? fmtCurrency(quote.price) : '—'}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: colorForChange(quote?.chgPct ?? 0), marginTop: 4,
            }}>
              {quote ? fmtPct(quote.chgPct) : '—'} today
            </div>
          </div>
        </div>

        {/* 6-up stat strip */}
        <div className="res-kpi-strip" style={{
          marginTop: 16, display: 'flex', border: '1px solid var(--border-color)',
          borderRadius: 6, overflow: 'hidden',
        }}>
          {STAT_STRIP.map((stat, i) => (
            <div key={stat.label} style={{
              flex: 1, minWidth: 0, padding: '10px 14px',
              borderLeft: i > 0 ? '1px solid var(--border-color)' : 'none',
            }}>
              <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
                color: 'var(--text-muted)', marginBottom: 4, whiteSpace: 'nowrap',
              }}>{stat.label}</div>
              <div style={{
                fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                color: 'var(--text-primary)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <ActionBtn onClick={() => setWatched(w => !w)}>{watched ? '★' : '☆'} Watch</ActionBtn>
          <ActionBtn onClick={openModal}>+ Add to Portfolio</ActionBtn>
          <ActionBtn onClick={() => alert('Coming soon')}>🔔 Set Alert</ActionBtn>
          <ActionBtn onClick={() => {
            const el = document.getElementById('section-peers');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}>⇄ Compare</ActionBtn>
          <ActionBtn onClick={() => {
            if (navigator.share) {
              navigator.share({ title: `${ticker} — Research`, url: window.location.href }).catch(() => {});
            } else {
              navigator.clipboard?.writeText(window.location.href).catch(() => {});
            }
          }}>↗ Share</ActionBtn>
        </div>
      </Card>

      {/* 1. PRICE CHART */}
      <PriceChart
        ticker={ticker}
        overlayPeers={overlayPeers}
        setOverlayPeers={setOverlayPeers}
        earningsHistory={earningsHistory}
      />

      {/* 2. AI THESIS */}
      <ThesisHero
        ticker={ticker}
        quote={quote}
        metrics={metrics}
        isSignedIn={!!isSignedIn}
        userId={user?.id}
        savedHoldings={savedHoldings}
        savedCash={savedCash}
        thesis={thesis}
        setThesis={setThesis}
        resolvedRevenue={resolvedRevenue}
        priorAnnualRevenue={priorAnnualRevenue}
      />

      {/* 3–4. Analyst Ratings | Earnings */}
      <div className="res-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <AnalystRatingsCard ticker={ticker} data={analystRatings} currentPrice={quote?.price} />
        <EarningsCard ticker={ticker} />
      </div>

      {/* 5–6. Financial Statements | Valuation Metrics */}
      <div className="res-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FinancialStatementsCard ticker={ticker} financials={financials} />
        <ValuationMetricsCard ticker={ticker} metrics={metrics} valHistory={valHistory} />
      </div>

      {/* DCF CALCULATOR (between Valuation Metrics and Insider) */}
      <DCFCalculator ticker={ticker} financials={financials} metrics={metrics} quote={quote} aiScenarios={aiScenarios} resolvedRevenue={resolvedRevenue} />

      {/* 7–8–9. Insider | Institutional | Short Interest */}
      <div className="res-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <InsiderTradingCard         ticker={ticker} />
        <InstitutionalOwnershipCard ticker={ticker} />
        <ShortInterestCard          ticker={ticker} />
      </div>

      {/* 10. Peer Comparison */}
      <div id="section-peers">
        <PeerComparisonCard
          ticker={ticker}
          overlayPeers={overlayPeers}
          setOverlayPeers={setOverlayPeers}
        />
      </div>

      {/* 11. SEC Filings */}
      <SECFilingsCard ticker={ticker} />

      {/* Portfolio modal */}
      {modalOpen && (
        <PortfolioModal
          holdings={savedHoldings}
          cash={savedCash}
          onSave={savePortfolio}
          onClose={() => setModalOpen(false)}
        />
      )}
    </main>
  );
}

export default function ResearchPage() {
  return (
    <Suspense fallback={
      <main style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </main>
    }>
      <ResearchPageInner />
    </Suspense>
  );
}
