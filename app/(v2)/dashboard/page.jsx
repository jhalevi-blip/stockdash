'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Card from '@/app/(v2)/_components/Card';
import HeroValue from './_components/HeroValue';
import MetricChip from './_components/MetricChip';
import MacroStrip from './_components/MacroStrip';
import HoldingsTable from './_components/HoldingsTable';
import AllocationDonut from './_components/AllocationDonut';
import MoversList from './_components/MoversList';
import PortfolioAISummary from '@/components/PortfolioAISummary';
import EarningsList from './_components/EarningsList';
import NewsFeed from './_components/NewsFeed';
import InsiderActivity from './_components/InsiderActivity';
import QuickJumpTiles from './_components/QuickJumpTiles';
import { PORTFOLIO, HOLDINGS, AI_SUMMARY, PORTFOLIO_SPARK, ALLOCATION } from './_lib/mockData';
import { fmtCurrency } from '@/app/(v2)/_lib/format';
import { useHoldings } from '@/lib/useHoldings';

const SECTOR_COLORS = {
  'Technology':             '#58a6ff',
  'Semiconductors':         '#3b82f6',
  'Financial Services':     '#22d3ee',
  'Healthcare':             '#3fb950',
  'Energy':                 '#d97706',
  'Consumer Cyclical':      '#f0b429',
  'Consumer Defensive':     '#a3e635',
  'Industrials':            '#c084fc',
  'Real Estate':            '#fb923c',
  'Utilities':              '#94a3b8',
  'Communication Services': '#e879f9',
  'Basic Materials':        '#fbbf24',
  'Other':                  '#6e7681',
};
const FALLBACK_PALETTE = ['#58a6ff', '#22d3ee', '#3fb950', '#d97706', '#f0b429', '#c084fc', '#fb923c'];

// PortfolioAISummary is reused as-is from the live dashboard. It
// renders its own card chrome (bg-card, border, border-radius 8) so we
// drop it directly into the page flow — no v2 Card wrapper. Passing
// initialSummary locks the component into display-only mode: no API
// calls, no buttons, no localStorage reads. See Phase D investigation.
export default function DashboardV2Page() {
  const router = useRouter();
  const [range,   setRange]  = useState('1M');
  const [sectors, setSectors] = useState({});

  // Real holdings + cash — Supabase-authoritative, listens to portfolio-saved event
  const { holdings, cash: cashData, error, refresh } = useHoldings();
  const [prices,   setPrices]   = useState({});
  const [history,  setHistory]  = useState(null); // [{ date, value }] — full 1-year daily series
  // Raw amount from Supabase (no currency conversion — pre-existing display behaviour preserved)
  const cash         = cashData?.amount   ?? 0;
  const cashCurrency = cashData?.currency ?? 'USD';
  const { isLoaded, isSignedIn } = useUser();

  // Prices: re-fetch whenever holdings change (useHoldings updates trigger this)
  useEffect(() => {
    if (!holdings?.length) return;
    const tickers = holdings.map(x => x.t).join(',');
    fetch(`/api/prices?tickers=${tickers}`)
      .then(r => r.json())
      .catch(() => [])
      .then(priceArr => {
        const priceMap = {};
        if (Array.isArray(priceArr)) priceArr.forEach(p => { priceMap[p.ticker] = p; });
        setPrices(priceMap);
      });
  }, [holdings]);

  // Fetch 1-year daily prices for all held tickers and compute portfolio value per day.
  // Runs after holdings are known. Skips if holdings is empty/null (mock/demo case).
  useEffect(() => {
    if (!holdings?.length) return;

    const tickers = [...new Set(holdings.map(h => h.t))];

    (async () => {
      try {
        const res  = await fetch(`/api/historical-prices?tickers=${tickers.join(',')}`);
        const json = await res.json();
        if (!Array.isArray(json.data) || !json.data.length) { setHistory(null); return; }

        // Build { [ticker]: { [date]: close } } for O(1) lookup
        const tickerDateClose = {};
        for (const { ticker, prices: p } of json.data) {
          tickerDateClose[ticker] = {};
          for (const { date, close } of p) tickerDateClose[ticker][date] = close;
        }

        // Union of all trading dates across all tickers, sorted ascending
        const dateSet = new Set();
        for (const { prices: p } of json.data) {
          for (const { date } of p) dateSet.add(date);
        }
        const dates = [...dateSet].sort();

        // Sum portfolio value per day; carry forward last known close for gaps
        const lastClose = {};
        const hist = dates.map(date => {
          let value = 0;
          for (const h of holdings) {
            const close = tickerDateClose[h.t]?.[date];
            if (close != null) lastClose[h.t] = close;
            value += h.s * (lastClose[h.t] ?? 0);
          }
          return { date, value };
        });

        setHistory(hist);
      } catch {
        setHistory(null);
      }
    })();
  }, [holdings]);

  // Fetch sector classification for each held ticker from /api/sectors.
  // Runs after holdings are known; 24h CDN cache on the route.
  useEffect(() => {
    if (!holdings?.length) return;
    const tickers = [...new Set(holdings.map(h => h.t))].join(',');
    fetch(`/api/sectors?tickers=${tickers}`)
      .then(r => r.json())
      .then(map => { if (map && !map.error) setSectors(map); })
      .catch(() => {});
  }, [holdings]);

  // Slice the full history array by the selected range → { date, value }[] for the hero chart.
  // Falls back to mock PORTFOLIO_SPARK (with synthetic trailing dates) when history hasn't loaded yet.
  const sparkData = useMemo(() => {
    if (!history || !history.length) {
      const now = Date.now();
      return PORTFOLIO_SPARK.map((value, i) => ({
        date: new Date(now - (PORTFOLIO_SPARK.length - 1 - i) * 86400000).toISOString().slice(0, 10),
        value,
      }));
    }
    const sliceCount = { '1W': 7, '1M': 22, '3M': 66, '1Y': Infinity, 'ALL': Infinity };
    const n = sliceCount[range] ?? 22; // '1D' guard: treat unknown range as 1M
    return n === Infinity ? history : history.slice(-n);
  }, [history, range]);

  // Compute enriched rows in the shape HoldingsTable expects.
  // Weight requires a two-pass: compute totalMktValue first, then assign weights.
  const enrichedRows = (() => {
    if (!holdings?.length) return [];
    const rows = holdings.map(h => {
      const q         = prices[h.t] ?? {};
      const price     = q.price  ?? 0;
      const change    = q.chgPct ?? 0;
      const shares    = h.s;
      const costBasis = h.c;
      const mktValue  = shares * price;
      const plDollar  = mktValue - shares * costBasis;
      const plPct     = costBasis > 0 ? (plDollar / (shares * costBasis)) * 100 : 0;
      return { ticker: h.t, name: '', shares, price, change, costBasis, mktValue, plDollar, plPct, weight: 0, sector: '' };
    });
    const totalMktValue = rows.reduce((s, r) => s + r.mktValue, 0);
    return rows.map(r => ({
      ...r,
      weight: totalMktValue > 0 ? (r.mktValue / totalMktValue) * 100 : 0,
    }));
  })();

  // Derive top movers from enrichedRows sorted by day change %.
  // null when no real holdings — MoversList falls back to mock.
  const realMovers = enrichedRows.length > 0
    ? {
        up:   [...enrichedRows].sort((a, b) => b.change - a.change).slice(0, 4).map(r => ({ ticker: r.ticker, change: r.change, last: r.price })),
        down: [...enrichedRows].sort((a, b) => a.change - b.change).slice(0, 4).map(r => ({ ticker: r.ticker, change: r.change, last: r.price })),
      }
    : null;

  // Comma-separated ticker string for feed components (news, earnings, insider).
  // null when no real holdings are loaded — feeds will skip their fetch and show loading state.
  const tickerList = enrichedRows.length > 0
    ? [...new Set(enrichedRows.map(r => r.ticker))].join(',')
    : HOLDINGS.map(h => h.ticker).join(',');

  // Compute sector allocation from enrichedRows + fetched sectors map.
  // Returns null when sectors haven't loaded yet — AllocationDonut falls back to ALLOCATION mock.
  const realAllocation = (() => {
    if (enrichedRows.length === 0 || Object.keys(sectors).length === 0) return null;
    const totalMktValue = enrichedRows.reduce((s, r) => s + r.mktValue, 0);
    if (totalMktValue <= 0) return null;
    const bySector = {};
    for (const r of enrichedRows) {
      const sector = sectors[r.ticker]?.sector ?? 'Other';
      bySector[sector] = (bySector[sector] ?? 0) + r.mktValue;
    }
    const entries = Object.entries(bySector)
      .map(([sector, val]) => ({ sector, pct: (val / totalMktValue) * 100 }))
      .sort((a, b) => b.pct - a.pct);
    return entries.map((e, i) => ({
      ...e,
      color: SECTOR_COLORS[e.sector] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
    }));
  })();

  // Compute real portfolio stats from enrichedRows + live prices.
  // Returns null when no real holdings are loaded (anonymous / demo).
  const realPortfolioStats = (() => {
    if (enrichedRows.length === 0) return null;
    const totalValue    = enrichedRows.reduce((s, r) => s + r.mktValue, 0);
    const totalCost     = enrichedRows.reduce((s, r) => s + r.shares * r.costBasis, 0);
    const unrealized    = totalValue - totalCost;
    const unrealizedPct = totalCost > 0 ? (unrealized / totalCost) * 100 : 0;
    const dayChange     = enrichedRows.reduce((s, r) => s + r.mktValue * (r.change / 100), 0);
    const prevValue     = totalValue - dayChange;
    const dayChangePct  = prevValue > 0 ? (dayChange / prevValue) * 100 : 0;
    return {
      totalValue, totalCost, unrealized, unrealizedPct, dayChange, dayChangePct,
      cash, cashCurrency, positions: enrichedRows.length,
      asOf: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    };
  })();

  // hero: real stats when signed in with holdings, mock otherwise
  const hero = realPortfolioStats ?? PORTFOLIO;

  // Map enrichedRows to the shape PortfolioAISummary expects (matches /dashboard row keys).
  const aiRows = enrichedRows.map(r => ({
    t:       r.ticker,
    s:       r.shares,
    costVal: r.shares * r.costBasis,
    price:   r.price,
    pnlPct:  r.plPct,
    mktVal:  r.mktValue,
  }));

  // portfolioStats shape for PortfolioAISummary (anonymous/mock fallback)
  const portfolioStats = {
    totalValue: PORTFOLIO.totalValue,
    totalPnl: PORTFOLIO.unrealized,
    totalPnlPct: PORTFOLIO.unrealizedPct,
    cash: PORTFOLIO.cash,
  };

  // ── Signed-in early-return guards (all hooks called above this line) ────────
  const centeredBox = {
    minHeight: '60vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 12,
    color: 'var(--text-secondary)', fontSize: 14, padding: 40,
  };
  const retryBtn = {
    background: '#2563eb', border: 'none', borderRadius: 6,
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    padding: '9px 20px',
  };

  if (!isLoaded) {
    return <div style={centeredBox}>Loading…</div>;
  }

  if (isSignedIn && error) {
    return (
      <div style={centeredBox}>
        <div>We couldn't load your portfolio.</div>
        <button onClick={refresh} style={retryBtn}>Retry</button>
      </div>
    );
  }

  if (isSignedIn && holdings === null) {
    return <div style={centeredBox}>Loading your portfolio…</div>;
  }

  if (isSignedIn && holdings.length === 0) {
    return (
      <div style={centeredBox}>
        <div>No holdings yet — add your portfolio to get started.</div>
      </div>
    );
  }

  // Anonymous users (isSignedIn === false) fall through to the existing render
  // with mock data, which is the intentional demo experience.

  return (
    <div style={{
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    }}>
      {/* 1. Hero strip */}
      <Card padding="18px 20px">
        <HeroValue range={range} onRange={setRange} sparkData={sparkData} data={hero} />
      </Card>

      {/* 2. KPI chips */}
      <div className="dv2-kpi-grid">
        <MetricChip label="Today's P&L"  value={fmtCurrency(hero.dayChange, 0)}  change={hero.dayChangePct} />
        <MetricChip label="Unrealized"   value={fmtCurrency(hero.unrealized, 0)} change={hero.unrealizedPct} />
        <MetricChip label="Positions"    value={String(hero.positions)} />
        <MetricChip label="Cash"         value={fmtCurrency(hero.cash, 0, hero.cashCurrency)} />
      </div>

      {/* 3. Macro strip */}
      <MacroStrip />

      {/* 4. Holdings + side rail */}
      <div className="dv2-holdings-grid">
        <Card title="Holdings" eyebrow="Live">
          {/* Use real enriched rows when available; fall back to mock for demo/anonymous visitors */}
          <HoldingsTable rows={enrichedRows.length > 0 ? enrichedRows : HOLDINGS} onRowClick={(r) => router.push(`/research?ticker=${r.ticker}`)} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Card title="Allocation by sector" eyebrow="Composition">
            <AllocationDonut size={120} strokeWidth={20} data={realAllocation ?? ALLOCATION} />
          </Card>
          <Card title="Top movers today" eyebrow="Intraday">
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--positive)',
              marginBottom: 4,
            }}>↑ Gainers</div>
            <MoversList kind="up"   movers={realMovers?.up} />
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--negative)',
              marginTop: 8, marginBottom: 4,
            }}>↓ Decliners</div>
            <MoversList kind="down" movers={realMovers?.down} />
          </Card>
        </div>
      </div>

      {/* 5. AI Summary — defer until Clerk resolves to prevent mock initialSummary being
            captured into useState before isSignedIn is known (race condition on refresh) */}
      {!isLoaded ? (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          minHeight: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}>
          Loading…
        </div>
      ) : (
        <PortfolioAISummary
          holdings={isSignedIn ? aiRows : HOLDINGS}
          portfolioStats={isSignedIn ? {
            totalValue:  hero.totalValue,
            totalPnl:    hero.unrealized,
            totalPnlPct: hero.unrealizedPct,
            cash:        hero.cash,
          } : portfolioStats}
          initialSummary={isSignedIn ? undefined : AI_SUMMARY}
          isSignedIn={!!isSignedIn}
        />
      )}

      {/* 6. Earnings · News · Insider — 3-column feed row */}
      <div className="dv2-feed-grid">
        <Card title="Upcoming Earnings" eyebrow="Calendar">
          <EarningsList tickers={tickerList} />
        </Card>
        <Card title="Portfolio News" eyebrow="Headlines">
          <NewsFeed tickers={tickerList} />
        </Card>
        <Card title="Insider Activity" eyebrow="Form 4">
          <InsiderActivity tickers={tickerList} />
        </Card>
      </div>

      {/* 7. Quick-jump tiles */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
          marginBottom: 8,
        }}>Explore</div>
        <QuickJumpTiles />
      </div>

      <div style={{
        marginTop: 8,
        padding: '14px 0 24px',
        color: 'var(--text-faint, rgba(230,237,243,0.45))',
        fontSize: 11,
        textAlign: 'center',
        borderTop: '1px solid var(--border-section, var(--border-color))',
      }}>
        StockDashes is for informational purposes only and does not constitute financial advice ·
        No account needed · Loads in seconds · Your data stays on your device
      </div>
    </div>
  );
}
