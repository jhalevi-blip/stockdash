'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Card from '@/app/(v2)/_components/Card';
import PortfolioModal from '@/components/PortfolioModal';
import { fmtCurrency, fmtPct, colorForChange } from '@/app/(v2)/_lib/format';
import { loadUserHoldings, saveUserHoldings } from '@/lib/holdingsStorage';

// Sector → brand color for the logo bug gradient (B1 palette per handoff)
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

function fmtCap(n) {
  if (n == null) return '—';
  // Finnhub marketCapitalization is in millions
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'T';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'B';
  return '$' + n.toFixed(0) + 'M';
}

function fmtRatio(n) {
  if (n == null || !isFinite(n) || n <= 0) return '—';
  return n.toFixed(1) + 'x';
}

// ── Logo bug — real image with gradient-initials fallback ─────────────────────
function LogoBug({ ticker, imageUrl, brandColor }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = imageUrl && !imgFailed;
  const containerStyle = {
    width:          44,
    height:         44,
    borderRadius:   10,
    flexShrink:     0,
    overflow:       'hidden',
    border:         `1px solid ${brandColor}50`,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  };
  if (showImage) {
    return (
      <div style={containerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`${ticker} logo`}
          loading="lazy"
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
      fontSize:      13,
      fontWeight:    700,
      color:         brandColor,
      fontFamily:    'monospace',
      letterSpacing: '-.01em',
    }}>
      {ticker.slice(0, 2)}
    </div>
  );
}

// ── Action button ──────────────────────────────────────────────────────────────
function ActionBtn({ onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background:    hover ? 'var(--bg-hover)' : 'transparent',
        border:        '1px solid ' + (hover ? 'var(--accent)' : 'var(--border-color)'),
        color:         hover ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize:      12,
        fontWeight:    500,
        padding:       '5px 12px',
        borderRadius:  5,
        cursor:        'pointer',
        fontFamily:    "'Segoe UI', system-ui, sans-serif",
        transition:    'background .15s, border-color .15s, color .15s',
        whiteSpace:    'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ── Placeholder card body ─────────────────────────────────────────────────────
function PlaceholderBody({ label, height = 100 }) {
  return (
    <div style={{
      height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontSize: 12,
    }}>
      {label}
    </div>
  );
}

// ── Inner page (uses useSearchParams — must be wrapped in Suspense) ───────────
function ResearchPageInner() {
  const searchParams = useSearchParams();
  const { user, isLoaded, isSignedIn } = useUser();

  const [ticker,  setTicker]  = useState(null); // null = resolving
  const [quote,   setQuote]   = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [profile, setProfile] = useState(null); // { sector, companyName, volAvg, image }
  const [watched, setWatched] = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [savedHoldings, setSavedHoldings] = useState([]);
  const [savedCash,     setSavedCash]     = useState(null);

  // ── Step 1: resolve ticker ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;

    const paramTicker = searchParams.get('ticker')?.toUpperCase();
    if (paramTicker) { setTicker(paramTicker); return; }

    if (isSignedIn && user?.id) {
      (async () => {
        try {
          const data = await fetch('/api/portfolio').then(r => r.json());
          if (data.signedIn && data.holdings?.length) {
            const equityHoldings = data.holdings.filter(h => h.t !== '__CASH__');
            if (equityHoldings.length) {
              const tickers = equityHoldings.map(h => h.t);
              const priceArr = await fetch(`/api/prices?tickers=${tickers.join(',')}`)
                .then(r => r.json()).catch(() => []);
              const priceMap = {};
              if (Array.isArray(priceArr)) priceArr.forEach(p => { priceMap[p.ticker] = p.price ?? 0; });
              const top = [...equityHoldings]
                .sort((a, b) => (b.s * (priceMap[b.t] ?? 0)) - (a.s * (priceMap[a.t] ?? 0)))[0];
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

  // ── Step 2: fetch quote + metrics + sector once ticker is known ─────────────
  useEffect(() => {
    if (!ticker) return;
    setQuote(null);
    setMetrics(null);
    setProfile(null);

    Promise.all([
      fetch(`/api/prices?tickers=${ticker}`).then(r => r.json()).catch(() => []),
      fetch(`/api/valuation?tickers=${ticker}`).then(r => r.json()).catch(() => []),
      fetch(`/api/sectors?tickers=${ticker}`).then(r => r.json()).catch(() => ({})),
    ]).then(([priceArr, valArr, sectorMap]) => {
      if (Array.isArray(priceArr) && priceArr[0]) setQuote(priceArr[0]);
      if (Array.isArray(valArr)   && valArr[0])   setMetrics(valArr[0]);
      if (sectorMap?.[ticker])                    setProfile(sectorMap[ticker]);
    });
  }, [ticker]);

  // ── Portfolio modal helpers ─────────────────────────────────────────────────
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
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ holdings, cash: cash?.amount > 0 ? cash : null }),
        });
      } catch {}
    }
    window.dispatchEvent(new CustomEvent('portfolio-saved'));
    setModalOpen(false);
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const sector     = profile?.sector ?? null;
  const brandColor = sector ? (SECTOR_COLOR[sector] ?? 'var(--accent)') : 'var(--accent)';

  const STAT_STRIP = [
    {
      label: 'Market Cap',
      value: fmtCap(metrics?.marketCap),
    },
    {
      label: 'P/E (TTM)',
      value: fmtRatio(metrics?.peRatio),
    },
    {
      label: 'Fwd P/E',
      value: fmtRatio(metrics?.forwardPE),
    },
    {
      label: 'Day Range',
      value: quote?.high != null
        ? `${fmtCurrency(quote.low)} – ${fmtCurrency(quote.high)}`
        : '—',
    },
    {
      label: '52W Range',
      value: quote?.week52High != null
        ? `${fmtCurrency(quote.week52Low)} – ${fmtCurrency(quote.week52High)}`
        : '—',
    },
    {
      label: 'Avg Volume',
      value: profile?.volAvg != null
        ? profile.volAvg.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
        : '—',
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!ticker) {
    return (
      <main style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </main>
    );
  }

  return (
    <main style={{
      padding:         '18px 20px',
      display:         'flex',
      flexDirection:   'column',
      gap:             14,
      paddingBottom:   'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      fontFamily:      "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>

      {/* ── Breadcrumbs ── */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <a href="/dashboard-v2" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</a>
        <span>›</span>
        <span>Research</span>
        <span>›</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ticker}</span>
      </div>

      {/* ── Stock header card ── */}
      <Card padding="18px 20px">

        {/* Row 1: Logo bug · identity · price */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>

          {/* Logo bug — 44×44: real image if available, gradient initials fallback */}
          <LogoBug ticker={ticker} imageUrl={profile?.image} brandColor={brandColor} />

          {/* Identity: ticker · name · sector chip */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{
                fontSize:       22,
                fontWeight:     700,
                fontFamily:     'monospace',
                color:          'var(--text-primary)',
                letterSpacing:  '-.01em',
              }}>
                {ticker}
              </span>
              {profile?.companyName && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{profile.companyName}</span>
              )}
              {sector && (
                <span style={{
                  fontSize:      9,
                  fontWeight:    600,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color:         'var(--accent-cyan)',
                  border:        '1px solid var(--accent-cyan)',
                  borderRadius:  4,
                  padding:       '1px 6px',
                  whiteSpace:    'nowrap',
                }}>
                  {sector}
                </span>
              )}
            </div>
          </div>

          {/* Price + day change */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize:          32,
              fontWeight:        700,
              fontVariantNumeric:'tabular-nums',
              color:             'var(--text-primary)',
              letterSpacing:     '-.02em',
              lineHeight:        1,
            }}>
              {quote ? fmtCurrency(quote.price) : '—'}
            </div>
            <div style={{
              fontSize:          14,
              fontWeight:        600,
              fontVariantNumeric:'tabular-nums',
              color:             colorForChange(quote?.chgPct ?? 0),
              marginTop:         4,
            }}>
              {quote ? fmtPct(quote.chgPct) : '—'} today
            </div>
          </div>
        </div>

        {/* Row 2: 6-up stat strip */}
        <div style={{
          marginTop:    16,
          display:      'flex',
          border:       '1px solid var(--border-color)',
          borderRadius: 6,
          overflow:     'hidden',
        }}>
          {STAT_STRIP.map((stat, i) => (
            <div key={stat.label} style={{
              flex:        1,
              minWidth:    0,
              padding:     '10px 14px',
              borderLeft:  i > 0 ? '1px solid var(--border-color)' : 'none',
            }}>
              <div style={{
                fontSize:      9,
                fontWeight:    600,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color:         'var(--text-muted)',
                marginBottom:  4,
                whiteSpace:    'nowrap',
              }}>
                {stat.label}
              </div>
              <div style={{
                fontSize:          12,
                fontWeight:        600,
                fontVariantNumeric:'tabular-nums',
                color:             'var(--text-primary)',
                whiteSpace:        'nowrap',
                overflow:          'hidden',
                textOverflow:      'ellipsis',
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Row 3: action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <ActionBtn onClick={() => setWatched(w => !w)}>
            {watched ? '★' : '☆'} Watch
          </ActionBtn>
          <ActionBtn onClick={openModal}>
            + Add to Portfolio
          </ActionBtn>
          <ActionBtn onClick={() => alert('Coming soon')}>
            🔔 Set Alert
          </ActionBtn>
          <ActionBtn onClick={() => {
            const el = document.getElementById('section-peers');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}>
            ⇄ Compare
          </ActionBtn>
          <ActionBtn onClick={() => {
            if (navigator.share) {
              navigator.share({ title: `${ticker} — Research`, url: window.location.href }).catch(() => {});
            } else {
              navigator.clipboard?.writeText(window.location.href).catch(() => {});
            }
          }}>
            ↗ Share
          </ActionBtn>
        </div>
      </Card>

      {/* ── PLACEHOLDER CARDS — B2/B3 will fill these ── */}

      {/* 1. Price chart — full width */}
      <Card title="Price Chart" eyebrow="Coming in B2">
        <PlaceholderBody label="Recharts AreaChart with range chips — loading in B2" height={160} />
      </Card>

      {/* 2. AI Investment Thesis — full width */}
      <Card title="AI Investment Thesis" eyebrow="Coming in B2">
        <PlaceholderBody label="Claude-powered per-ticker thesis — loading in B2" height={80} />
      </Card>

      {/* 3–4. Analyst Ratings | Earnings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Analyst Ratings" eyebrow="Coming in B3">
          <PlaceholderBody label="Buy / Hold / Sell consensus + price target — loading in B3" />
        </Card>
        <Card title="Earnings" eyebrow="Coming in B3">
          <PlaceholderBody label="EPS history + next date — loading in B3" />
        </Card>
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

      {/* 10. Peer Comparison — full width, anchor for Compare button */}
      <div id="section-peers">
        <Card title="Peer Comparison" eyebrow="Coming in B3">
          <PlaceholderBody label="Valuation vs sector peers — loading in B3" />
        </Card>
      </div>

      {/* 11. SEC Filings — full width */}
      <Card title="SEC Filings" eyebrow="Coming in B3">
        <PlaceholderBody label="10-K, 10-Q, 8-K via /api/research — loading in B3" />
      </Card>

      {/* ── Portfolio modal ── */}
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

// Suspense boundary required for useSearchParams() in App Router
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
