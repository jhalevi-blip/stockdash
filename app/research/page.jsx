'use client';
import DemoPrompt from '@/components/DemoPrompt';
import { useState, useEffect } from 'react';
import { getDemoTickers } from '@/lib/startDemo';

const FILING_TYPES = {
  '10-K': '#2563eb', '10-Q': '#16a34a', '8-K': '#d97706', 'DEF 14A': '#7c3aed',
};

export default function ResearchPage() {
  const [tickers,    setTickers]    = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [tab,        setTab]        = useState('filings');
  const [filings,    setFilings]    = useState([]);
  const [news,       setNews]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [dark,       setDark]       = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      const t = holdings.map(h => h.t);
      setTickers(t.length ? t : (localStorage.getItem('stockdash_demo') === 'true' ? getDemoTickers() : []));
    } catch {}
  }, []);

  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const loadData = async (ticker) => {
    setSelected(ticker);
    setLoading(true);
    setFilings([]); setNews([]);
    try {
      const [fil, nws] = await Promise.all([
        fetch(`/api/research?symbol=${ticker}&type=filings`).then(r => r.json()),
        fetch(`/api/research?symbol=${ticker}&type=news`).then(r => r.json()),
      ]);
      setFilings(Array.isArray(fil) ? fil : []);
      setNews(Array.isArray(nws) ? nws : []);
    } catch {}
    setLoading(false);
  };

  const filteredFilings = filterType === 'all'
    ? filings : filings.filter(f => f.type === filterType);

  // Theme tokens
  const cardBg       = dark ? '#161b22' : '#ffffff';
  const cardBorder   = dark ? '#21262d' : '#e2e6ed';
  const cardHoverBorder = dark ? '#58a6ff' : '#2563eb';
  const cardHoverShadow = dark ? '0 2px 8px rgba(88,166,255,0.1)' : '0 2px 8px rgba(37,99,235,0.1)';
  const titleColor   = dark ? '#e6edf3' : '#1a1d23';
  const mutedColor   = dark ? '#8b949e' : '#9ca3af';
  const btnUnselBg   = dark ? '#21262d' : '#f3f4f6';
  const btnUnselColor= dark ? '#c9d1d9' : '#374151';
  const btnUnselBorder = dark ? '#30363d' : '#e2e6ed';
  const filterActiveBg = dark ? '#1e3a5f' : '#eff6ff';
  const filterInactiveColor = dark ? '#8b949e' : '#6b7280';
  const filterInactiveBorder = dark ? '#30363d' : '#e2e6ed';
  const tickerBadgeBg     = dark ? '#1e3a5f' : '#eff6ff';
  const tickerBadgeBorder = dark ? '#2563eb'  : '#bfdbfe';
  const tickerBadgeColor  = dark ? '#58a6ff'  : '#2563eb';
  const summaryColor = dark ? '#6b7280' : '#6b7280';

  return (
    <main style={{ padding: '20px 24px' }}>
      {/* Ticker selector */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Select Stock</div>
        {tickers.length === 0 ? (
          <DemoPrompt message="Add stocks to your portfolio to view research" />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tickers.map(t => (
              <button key={t} onClick={() => loadData(t)} style={{
                background: selected === t ? '#2563eb' : btnUnselBg,
                color:      selected === t ? '#fff'    : btnUnselColor,
                border:     `1px solid ${selected === t ? '#2563eb' : btnUnselBorder}`,
                borderRadius: 4, padding: '6px 14px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {tickers.length > 0 && !selected && <div className="chart-placeholder">Select a stock to view SEC filings and news</div>}
      {loading   && <div className="chart-placeholder">Loading research data for {selected}…</div>}

      {!loading && selected && (
        <>
          {/* Tab buttons */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {[['filings', '📄 SEC Filings'], ['news', '📰 Latest News']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                background: tab === key ? '#2563eb' : btnUnselBg,
                color:      tab === key ? '#fff'    : btnUnselColor,
                border:     `1px solid ${tab === key ? '#2563eb' : btnUnselBorder}`,
                borderRadius: 4, padding: '7px 16px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>

          {/* Filings tab */}
          {tab === 'filings' && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {['all', '10-K', '10-Q', '8-K'].map(type => (
                  <button key={type} onClick={() => setFilterType(type)} style={{
                    background:   filterType === type ? filterActiveBg : 'transparent',
                    color:        filterType === type ? tickerBadgeColor : filterInactiveColor,
                    border:       `1px solid ${filterType === type ? '#2563eb' : filterInactiveBorder}`,
                    borderRadius: 4, padding: '3px 10px', fontSize: 11,
                    fontWeight: 600, cursor: 'pointer',
                  }}>{type === 'all' ? 'All' : type}</button>
                ))}
              </div>

              {filteredFilings.length === 0 ? (
                <div className="chart-placeholder">No filings found for {selected}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredFilings.map((f, i) => (
                    <a key={i} href={f.finalLink} target="_blank" rel="noopener noreferrer" style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      background: cardBg, border: `1px solid ${cardBorder}`,
                      borderRadius: 8, padding: '12px 16px', textDecoration: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'border-color .2s, box-shadow .2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = cardHoverBorder;
                      e.currentTarget.style.boxShadow = cardHoverShadow;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = cardBorder;
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                    }}>
                      <span style={{
                        background: `${FILING_TYPES[f.type] || '#6b7280'}15`,
                        border:     `1px solid ${FILING_TYPES[f.type] || '#6b7280'}`,
                        color:      FILING_TYPES[f.type] || '#6b7280',
                        borderRadius: 3, padding: '2px 8px', fontSize: 11,
                        fontWeight: 700, whiteSpace: 'nowrap', minWidth: 50, textAlign: 'center',
                      }}>{f.type}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: titleColor, fontWeight: 600 }}>{f.title}</div>
                        <div style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>{f.filingDate}</div>
                      </div>
                      <span style={{ fontSize: 11, color: tickerBadgeColor }}>View →</span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          {/* News tab */}
          {tab === 'news' && (
            <>
              {news.length === 0 ? (
                <div className="chart-placeholder">No news found for {selected}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {news.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{
                      display: 'flex', gap: 14, background: cardBg,
                      border: `1px solid ${cardBorder}`, borderRadius: 8,
                      padding: '14px 16px', textDecoration: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'border-color .2s, box-shadow .2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = cardHoverBorder;
                      e.currentTarget.style.boxShadow = cardHoverShadow;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = cardBorder;
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                    }}>
                      {a.image && (
                        <img src={a.image} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            background: tickerBadgeBg, border: `1px solid ${tickerBadgeBorder}`,
                            borderRadius: 3, padding: '1px 7px', fontSize: 11,
                            color: tickerBadgeColor, fontWeight: 700,
                          }}>{selected}</span>
                          <span style={{ fontSize: 11, color: mutedColor }}>{a.source}</span>
                          <span style={{ fontSize: 11, color: mutedColor, marginLeft: 'auto' }}>
                            {new Date(a.datetime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: titleColor, fontWeight: 600, lineHeight: 1.4 }}>{a.headline}</div>
                        {a.summary && (
                          <div style={{ fontSize: 12, color: summaryColor, marginTop: 4, lineHeight: 1.5 }}>
                            {a.summary.slice(0, 120)}…
                          </div>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
