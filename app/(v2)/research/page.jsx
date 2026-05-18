'use client';

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import Card from '@/app/(v2)/_components/Card';
import PortfolioModal from '@/components/PortfolioModal';
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
function ThesisHero({ ticker, quote, metrics, isSignedIn, userId, savedHoldings, thesis, setThesis, resolvedRevenue, priorAnnualRevenue }) {
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
        .map(h => ({ ticker: h.t, shares: h.s, avgCost: h.s > 0 ? (h.costVal / h.s) : null, marketValue: h.mktVal ?? null }))
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
      const res  = await fetch('/api/stock-quick-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ticker, prompt, price: quote?.price }),
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
            AI THESIS · POWERED BY CLAUDE OPUS 4.7
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
            Claude Thesis · Opus 4.7 · 3-year horizon
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

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

function Slider({ label, value, min, max, step, onChange, unit = '%' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
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
            <Slider label="WACC"               value={wacc}           min={4}  max={18} step={0.5}  onChange={handleSlider(setWacc)} />
            <Slider label="Terminal Growth"    value={terminalGrowth} min={1}  max={5}  step={0.25} onChange={handleSlider(setTerminalGrowth)} />
            <Slider label="Revenue CAGR"       value={revenueCagr}    min={0}  max={60} step={1}    onChange={handleSlider(setRevenueCagr)} />
            <Slider label="Terminal Op Margin" value={terminalMargin} min={5}  max={80} step={1}    onChange={handleSlider(setTerminalMargin)} />
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
    ]).then(([priceArr, valArr, sectorMap, earnsHist, fins]) => {
      if (Array.isArray(priceArr) && priceArr[0]) setQuote(priceArr[0]);
      if (Array.isArray(valArr)   && valArr[0])   setMetrics(valArr[0]);
      if (sectorMap?.[ticker])                    setProfile(sectorMap[ticker]);
      if (Array.isArray(earnsHist))               setEarningsHistory(earnsHist);
      if (fins && !fins.error)                    setFinancials(fins);
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
        <a href="/dashboard-v2" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</a>
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
        <div style={{
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
        thesis={thesis}
        setThesis={setThesis}
        resolvedRevenue={resolvedRevenue}
        priorAnnualRevenue={priorAnnualRevenue}
      />

      {/* 3–4. Analyst Ratings | Earnings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Analyst Ratings" eyebrow="Coming in B3">
          <PlaceholderBody label="Buy / Hold / Sell consensus + price target — loading in B3" />
        </Card>
        <EarningsCard ticker={ticker} />
      </div>

      {/* 5–6. Financial Statements | Valuation Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Financial Statements" eyebrow="Coming in B3">
          <PlaceholderBody label="Revenue, margins, EPS — loading in B3" />
        </Card>
        <Card title="Valuation Metrics" eyebrow="Coming in B3">
          <PlaceholderBody label="P/E, P/S, EV/EBITDA table — loading in B3" />
        </Card>
      </div>

      {/* DCF CALCULATOR (between Valuation Metrics and Insider) */}
      <DCFCalculator ticker={ticker} financials={financials} metrics={metrics} quote={quote} aiScenarios={aiScenarios} resolvedRevenue={resolvedRevenue} />

      {/* 7–8–9. Insider | Institutional | Short Interest */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <Card title="Insider Trading" eyebrow="Coming in B3">
          <PlaceholderBody label="Form 4 trades — loading in B3" height={120} />
        </Card>
        <Card title="Institutional Ownership" eyebrow="Coming in B3">
          <PlaceholderBody label="13F holdings — loading in B3" height={120} />
        </Card>
        <Card title="Short Interest" eyebrow="Coming in B3">
          <PlaceholderBody label="Short % float, ratio — loading in B3" height={120} />
        </Card>
      </div>

      {/* 10. Peer Comparison */}
      <div id="section-peers">
        <Card title="Peer Comparison" eyebrow="Coming in B3">
          <PlaceholderBody label="Valuation vs sector peers — loading in B3" />
        </Card>
      </div>

      {/* 11. SEC Filings */}
      <Card title="SEC Filings" eyebrow="Coming in B3">
        <PlaceholderBody label="10-K, 10-Q, 8-K via /api/research — loading in B3" />
      </Card>

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
