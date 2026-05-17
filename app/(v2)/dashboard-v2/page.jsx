'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { PORTFOLIO, HOLDINGS, AI_SUMMARY, PORTFOLIO_SPARK } from './_lib/mockData';
import { fmtCurrency } from '@/app/(v2)/_lib/format';
import { loadUserHoldings, getCacheOwner } from '@/lib/holdingsStorage';

// PortfolioAISummary is reused as-is from the live dashboard. It
// renders its own card chrome (bg-card, border, border-radius 8) so we
// drop it directly into the page flow — no v2 Card wrapper. Passing
// initialSummary locks the component into display-only mode: no API
// calls, no buttons, no localStorage reads. See Phase D investigation.
export default function DashboardV2Page() {
  const [range, setRange] = useState('1M');

  // Real holdings state — loaded from localStorage/API + enriched with live prices
  const [holdings, setHoldings] = useState([]);
  const [prices,   setPrices]   = useState({});
  const [history,  setHistory]  = useState(null); // [{ date, value }] — full 1-year daily series
  const [cash,     setCash]     = useState(0);    // cash balance in USD from /api/portfolio
  const { user, isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    const userId = user?.id ?? null;

    function getLocalShared() {
      try {
        const s = localStorage.getItem('stockdash_holdings');
        return s ? JSON.parse(s) : [];
      } catch { return []; }
    }

    (async () => {
      try {
        let h = [];

        if (isSignedIn && userId) {
          // Signed-in: prefer user-scoped local cache, fall back to server
          const localAtLoad  = loadUserHoldings(userId) ?? [];
          const localIsValid = localAtLoad.length > 0 && getCacheOwner() === userId;
          if (localIsValid) {
            h = localAtLoad;
          } else {
            try {
              const data = await fetch('/api/portfolio').then(r => r.json());
              if (data.signedIn && data.holdings?.length) h = data.holdings;
              setCash(data.cash?.amount ?? 0);
            } catch {}
          }
        } else {
          // Anonymous: check shared localStorage cache (set by manual entry or demo)
          const local = getLocalShared();
          if (local.length) h = local;
        }

        setHoldings(h);
        if (!h.length) return;

        const tickers = h.map(x => x.t).join(',');
        const priceArr = await fetch(`/api/prices?tickers=${tickers}`)
          .then(r => r.json())
          .catch(() => []);
        const priceMap = {};
        if (Array.isArray(priceArr)) priceArr.forEach(p => { priceMap[p.ticker] = p; });
        setPrices(priceMap);
      } catch {}
    })();
  }, [isLoaded, isSignedIn, user?.id]);

  // Fetch 1-year daily prices for all held tickers and compute portfolio value per day.
  // Runs after holdings are known. Skips if holdings is empty (mock/demo case).
  useEffect(() => {
    if (!holdings.length) return;

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

  // Slice the full history array by the selected range → flat number[] for Sparkline.
  // Falls back to mock PORTFOLIO_SPARK when history hasn't loaded yet.
  const sparkData = useMemo(() => {
    if (!history || !history.length) return PORTFOLIO_SPARK;
    const sliceCount = { '1W': 7, '1M': 22, '3M': 66, '1Y': Infinity, 'ALL': Infinity };
    const n = sliceCount[range] ?? 22; // '1D' guard: treat unknown range as 1M
    const sliced = n === Infinity ? history : history.slice(-n);
    return sliced.map(d => d.value);
  }, [history, range]);

  // Compute enriched rows in the shape HoldingsTable expects.
  // Weight requires a two-pass: compute totalMktValue first, then assign weights.
  const enrichedRows = (() => {
    if (!holdings.length) return [];
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

  // Comma-separated ticker string for feed components (news, earnings, insider).
  // null when no real holdings are loaded — feeds will skip their fetch and show loading state.
  const tickerList = enrichedRows.length > 0
    ? [...new Set(enrichedRows.map(r => r.ticker))].join(',')
    : HOLDINGS.map(h => h.ticker).join(',');

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
      cash, positions: enrichedRows.length,
      asOf: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    };
  })();

  // hero: real stats when signed in with holdings, mock otherwise
  const hero = realPortfolioStats ?? PORTFOLIO;

  // portfolioStats shape for PortfolioAISummary
  const portfolioStats = {
    totalValue: PORTFOLIO.totalValue,
    totalPnl: PORTFOLIO.unrealized,
    totalPnlPct: PORTFOLIO.unrealizedPct,
    cash: PORTFOLIO.cash,
  };

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
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 10,
      }}>
        <MetricChip label="Today's P&L"  value={fmtCurrency(hero.dayChange, 0)}  change={hero.dayChangePct} />
        <MetricChip label="Unrealized"   value={fmtCurrency(hero.unrealized, 0)} change={hero.unrealizedPct} />
        <MetricChip label="Positions"    value={String(hero.positions)} />
        <MetricChip label="Cash"         value={fmtCurrency(hero.cash, 0)} />
      </div>

      {/* 3. Macro strip */}
      <MacroStrip />

      {/* 4. Holdings + side rail */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)',
        gap: 14,
      }}>
        <Card title="Holdings" eyebrow="Live">
          {/* Use real enriched rows when available; fall back to mock for demo/anonymous visitors */}
          <HoldingsTable rows={enrichedRows.length > 0 ? enrichedRows : HOLDINGS} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Card title="Allocation by sector" eyebrow="Composition">
            <AllocationDonut size={140} strokeWidth={20} />
          </Card>
          <Card title="Top movers today" eyebrow="Intraday">
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--positive-soft)',
              marginBottom: 4,
            }}>↑ Gainers</div>
            <MoversList kind="up" />
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--negative-soft)',
              marginTop: 8, marginBottom: 4,
            }}>↓ Decliners</div>
            <MoversList kind="down" />
          </Card>
        </div>
      </div>

      {/* 5. AI Summary — reuses existing PortfolioAISummary with mock data */}
      <PortfolioAISummary
        holdings={HOLDINGS}
        portfolioStats={portfolioStats}
        initialSummary={AI_SUMMARY}
        isSignedIn={false}
      />

      {/* 6. Earnings · News · Insider — 3-column feed row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 14,
      }}>
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
