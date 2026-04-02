// fix-v4
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { COLORS, usd, f } from '@/lib/utils';
import SummaryBar from '@/components/SummaryBar';
import HoldingsTable from '@/components/HoldingsTable';
import StockChart from '@/components/StockChart';
import SearchBar from '@/components/SearchBar';
import NewsFeed from '@/components/NewsFeed';
import EarningsCalendar from '@/components/EarningsCalendar';

const STORAGE_KEY = 'stockdash_holdings';
const API_SOURCES = ['finnhub', 'fmp', 'edgar', 'yahoo'];
const SOURCE_LABELS = { finnhub: 'Finnhub', fmp: 'FMP', edgar: 'EDGAR', yahoo: 'Yahoo' };

async function saveHoldings(userId, holdings) {
  if (userId) {
    console.log('[saveHoldings] signed in as', userId, '— posting to /api/holdings');
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings }),
      });
      const json = await res.json();
      console.log('[saveHoldings] response:', res.status, json);
    } catch (err) {
      console.error('[saveHoldings] fetch error:', err);
    }
  } else {
    console.log('[saveHoldings] no userId — localStorage only');
  }
  // Always keep localStorage in sync as fallback
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

async function fetchHoldings(userId) {
  if (userId) {
    console.log('[fetchHoldings] signed in as', userId, '— fetching /api/holdings');
    try {
      const res = await fetch('/api/holdings');
      console.log('[fetchHoldings] response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[fetchHoldings] rows:', data);
        if (Array.isArray(data) && data.length) {
          return data.map(r => ({ t: r.ticker, n: r.ticker, s: r.shares, c: r.avg_cost }));
        }
      }
    } catch (err) {
      console.error('[fetchHoldings] fetch error:', err);
    }
  }
  // Fall back to localStorage
  console.log('[fetchHoldings] falling back to localStorage');
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const raw = stored ? JSON.parse(stored) : [];
    return Array.isArray(raw) ? raw.map(h => ({
      t: (h.t ?? h.ticker ?? '').toUpperCase(),
      n: h.n ?? h.name ?? h.t ?? h.ticker ?? '',
      s: parseFloat(h.s ?? h.shares ?? 0) || 0,
      c: parseFloat(h.c ?? h.cost ?? h.avgCost ?? 0) || 0,
    })).filter(h => h.t) : [];
  } catch {
    return [];
  }
}

function SetupPage({ onSave, initialHoldings = [] }) {
  const { user } = useUser();
  const initCount = initialHoldings.length || 1;
  const [rows, setRows]       = useState(() => Array.from({ length: initCount }, (_, i) => i));
  const [error, setError]     = useState('');
  const [invalid, setInvalid] = useState({});
  const [saving, setSaving]   = useState(false);
  const tickerRefs = useRef([]);
  const sharesRefs = useRef([]);
  const costRefs   = useRef([]);

  const addRow = () => setRows(r => [...r, r.length]);
  const removeRow = (i) => setRows(r => r.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const valid = [];
    const newInvalid = {};

    rows.forEach((_, i) => {
      const ticker = (tickerRefs.current[i]?.value ?? '').trim().toUpperCase();
      const shares = (sharesRefs.current[i]?.value ?? '').trim();
      const cost   = (costRefs.current[i]?.value ?? '').trim();

      if (!ticker) return;

      if (!shares || !parseFloat(shares)) newInvalid[`${i}-shares`] = true;
      if (!cost   || !parseFloat(cost))   newInvalid[`${i}-cost`]   = true;

      valid.push({
        t: ticker,
        n: ticker,
        s: parseFloat(shares) || 0,
        c: parseFloat(cost)   || 0,
      });
    });

    setInvalid(newInvalid);

    if (!valid.length) {
      setError('Add at least one ticker.');
      return;
    }
    if (Object.keys(newInvalid).length) {
      setError('Please fill in shares and avg cost for all holdings.');
      return;
    }

    setError('');
    setSaving(true);
    // Use Clerk userId only if available — never block on it
    const currentUserId = user?.id ?? null;
    await saveHoldings(currentUserId, valid);
    setSaving(false);
    onSave(valid);
  };

  return (
    <main style={{ maxWidth: 560, margin: '60px auto', padding: '0 24px' }}>
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>Set up your portfolio</div>
        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 28 }}>
          Enter your holdings. Your data stays in your browser — nothing is sent to a server.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
          {['Ticker', 'Shares', 'Avg Cost', ''].map((h, i) => (
            <div key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {rows.map((_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
            <input
              ref={el => tickerRefs.current[i] = el}
              defaultValue={initialHoldings[i]?.t ?? ''}
              autoComplete="off"
              placeholder="AMD"
              style={inputStyle}
            />
            <input
              ref={el => sharesRefs.current[i] = el}
              defaultValue={initialHoldings[i]?.s > 0 ? String(initialHoldings[i].s) : ''}
              autoComplete="off"
              inputMode="decimal"
              placeholder="100"
              style={{ ...inputStyle, border: `1px solid ${invalid[`${i}-shares`] ? '#f85149' : '#30363d'}` }}
            />
            <input
              ref={el => costRefs.current[i] = el}
              defaultValue={initialHoldings[i]?.c > 0 ? String(initialHoldings[i].c) : ''}
              autoComplete="off"
              inputMode="decimal"
              placeholder="50.00"
              style={{ ...inputStyle, border: `1px solid ${invalid[`${i}-cost`] ? '#f85149' : '#30363d'}` }}
            />
            <button onClick={() => removeRow(i)} style={btnDeleteStyle} title="Remove">✕</button>
          </div>
        ))}

        {error && <div style={{ color: '#f85149', fontSize: 12, marginTop: 8, marginBottom: 4 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={addRow} style={btnSecStyle}>+ Add Row</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimaryStyle}>
            {saving ? 'Saving…' : 'Save & Continue →'}
          </button>
        </div>
      </div>
    </main>
  );
}

const inputStyle = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 4,
  color: '#e6edf3', padding: '7px 10px', fontSize: 13, width: '100%',
  outline: 'none', boxSizing: 'border-box',
};
const btnPrimaryStyle = {
  background: '#1f6feb', color: '#fff', border: '1px solid #58a6ff',
  borderRadius: 4, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSecStyle = {
  background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d',
  borderRadius: 4, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnDeleteStyle = {
  background: 'none', color: '#484f58', border: '1px solid #21262d',
  borderRadius: 4, padding: '7px 10px', fontSize: 12, cursor: 'pointer',
};

export default function Home() {
  const { user, isLoaded } = useUser();
  const [holdings,     setHoldings]     = useState(null); // null = loading
  const [setupMode,    setSetupMode]    = useState(false);
  const [prices,       setPrices]       = useState({});
  const [status,       setStatus]       = useState('idle');
  const [lastUpdated,  setLastUpdated]  = useState('');
  const [selected,     setSelected]     = useState(null);
  const [search,       setSearch]       = useState('');
  const [health,       setHealth]       = useState(null);

  // Step 1: load from localStorage immediately — no Clerk dependency
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const raw = stored ? JSON.parse(stored) : [];
      const normalized = Array.isArray(raw) ? raw.map(h => ({
        t: (h.t ?? h.ticker ?? '').toUpperCase(),
        n: h.n ?? h.name ?? h.t ?? h.ticker ?? '',
        s: parseFloat(h.s ?? h.shares ?? 0) || 0,
        c: parseFloat(h.c ?? h.cost ?? h.avgCost ?? 0) || 0,
      })).filter(h => h.t) : [];
      setHoldings(normalized);
    } catch {
      setHoldings([]);
    }
  }, []);

  // Step 2: once Clerk resolves and user is signed in, try Supabase sync
  useEffect(() => {
    if (!isLoaded || !user?.id) return;
    fetchHoldings(user.id).then(h => {
      if (h.length) setHoldings(h);
    });
  }, [isLoaded, user?.id]);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  const tickersParam = holdings?.map(h => h.t).join(',') ?? '';

  const fetchPrices = useCallback(async () => {
    if (!tickersParam) return;
    setStatus('loading');
    try {
      const res  = await fetch(`/api/prices?tickers=${tickersParam}`);
      const data = await res.json();
      const map  = {};
      if (Array.isArray(data)) data.forEach(d => { map[d.ticker] = d; });
      setPrices(map);
      setStatus('live');
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setStatus('error');
    }
  }, [tickersParam]);

  useEffect(() => {
    if (holdings?.length) fetchPrices();
  }, [fetchPrices, holdings]);

  if (holdings === null) return null; // waiting for localStorage

  if (!holdings.length || setupMode) {
    return <SetupPage
      onSave={(h) => { setHoldings(h); setSetupMode(false); }}
      initialHoldings={setupMode ? holdings : []}
    />;
  }

  const searchUpper = search.toUpperCase();
  const rows = holdings
    .map(h => {
      const p      = prices[h.t] || {};
      const basis  = h.s * h.c;
      const mktVal = p.price ? h.s * p.price : null;
      const pnl    = mktVal != null ? mktVal - basis : null;
      const pnlPct = pnl != null ? pnl / basis * 100 : null;
      return { ...h, ...p, basis, mktVal, pnl, pnlPct };
    })
    .filter(r => !searchUpper || r.t.includes(searchUpper) || (r.n ?? '').toUpperCase().includes(searchUpper));

  const totVal = rows.reduce((s, r) => s + (r.mktVal ?? r.basis), 0);
  const tickers = holdings.map(h => h.t);

  return (
    <>
      <div className="hdr-right" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, background: '#111416', borderBottom: '1px solid #21262d' }}>
        <SearchBar onSearch={setSearch} />
        {lastUpdated && <span className="upd-time">Updated {lastUpdated}</span>}
        <button className="btn-sec" onClick={fetchPrices} disabled={status === 'loading'}>
          {status === 'loading' ? '⏳ Refreshing…' : '↻ Refresh'}
        </button>
        <button className="btn-sec" onClick={() => setSetupMode(true)} style={{ fontSize: 11 }}>
          Edit Portfolio
        </button>
      </div>

      <div style={{ background: '#0d1117', borderBottom: '1px solid #21262d', padding: '4px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        {API_SOURCES.map(src => {
          const h = health?.[src];
          const color = !health ? '#6b7280' : h?.status === 'ok' ? '#3fb950' : '#f85149';
          const label = SOURCE_LABELS[src];
          return (
            <span key={src} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8b949e' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {label}
              {h?.status === 'error' && <span style={{ color: '#f85149', fontSize: 10 }}>· unavailable</span>}
              {h?.status === 'ok' && <span style={{ color: '#484f58', fontSize: 10 }}>{h.latency}ms</span>}
            </span>
          );
        })}
      </div>

      {user?.firstName && (
        <div style={{ padding: '8px 24px', background: '#161b22', borderBottom: '1px solid #21262d', fontSize: 13, color: '#8b949e' }}>
          Welcome back, <span style={{ color: '#e6edf3', fontWeight: 600 }}>{user.firstName}</span>
        </div>
      )}

      <SummaryBar rows={rows} status={status} lastUpdated={lastUpdated} />

      <main>
        <section>
          <div className="section-title">Holdings &amp; Performance</div>
          <HoldingsTable rows={rows} totVal={totVal} onSelect={setSelected} selected={selected} />
        </section>

        <section>
          <div className="section-title">
            {selected ? `${selected} — Price Chart` : 'Price Chart'}
          </div>
          <StockChart ticker={selected} />
        </section>

        <section>
          <div className="section-title">Earnings Calendar</div>
          <EarningsCalendar tickers={tickers} />
        </section>

        <section>
          <div className="section-title">Latest News</div>
          <NewsFeed tickers={tickers} />
        </section>
      </main>
    </>
  );
}
