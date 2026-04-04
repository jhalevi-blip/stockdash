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

  useEffect(() => {
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      const t = holdings.map(h => h.t);
      setTickers(t.length ? t : (localStorage.getItem('stockdash_demo') === 'true' ? getDemoTickers() : []));
    } catch {}
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

  const btnBase = {
    borderRadius: 4, padding: '6px 14px', fontSize: 12,
    fontWeight: 600, cursor: 'pointer', transition: 'background .15s',
  };

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
                ...btnBase,
                background: selected === t ? 'var(--accent)' : 'var(--bg-secondary)',
                color:      selected === t ? '#fff' : 'var(--text-secondary)',
                border:     `1px solid ${selected === t ? 'var(--accent)' : 'var(--border-color)'}`,
              }}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {tickers.length > 0 && !selected && <div className="chart-placeholder">Select a stock to view SEC filings and news</div>}
      {loading && <div className="chart-placeholder">Loading research data for {selected}…</div>}

      {!loading && selected && (
        <>
          {/* Tab buttons */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {[['filings', '📄 SEC Filings'], ['news', '📰 Latest News']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                ...btnBase,
                padding: '7px 16px',
                background: tab === key ? 'var(--accent)' : 'var(--bg-secondary)',
                color:      tab === key ? '#fff' : 'var(--text-secondary)',
                border:     `1px solid ${tab === key ? 'var(--accent)' : 'var(--border-color)'}`,
              }}>{label}</button>
            ))}
          </div>

          {/* Filings tab */}
          {tab === 'filings' && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {['all', '10-K', '10-Q', '8-K'].map(type => (
                  <button key={type} onClick={() => setFilterType(type)} style={{
                    background:   filterType === type ? 'var(--bg-accent-subtle)' : 'transparent',
                    color:        filterType === type ? 'var(--accent)' : 'var(--text-muted)',
                    border:       `1px solid ${filterType === type ? 'var(--accent)' : 'var(--border-color)'}`,
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
                      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                      borderRadius: 8, padding: '12px 16px', textDecoration: 'none',
                      transition: 'border-color .2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}>
                      <span style={{
                        background: `${FILING_TYPES[f.type] || 'var(--text-muted)'}18`,
                        border:     `1px solid ${FILING_TYPES[f.type] || 'var(--border-color)'}`,
                        color:      FILING_TYPES[f.type] || 'var(--text-muted)',
                        borderRadius: 3, padding: '2px 8px', fontSize: 11,
                        fontWeight: 700, whiteSpace: 'nowrap', minWidth: 50, textAlign: 'center',
                      }}>{f.type}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{f.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f.filingDate}</div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--accent)' }}>View →</span>
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
                      display: 'flex', gap: 14, background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)', borderRadius: 8,
                      padding: '14px 16px', textDecoration: 'none',
                      transition: 'border-color .2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}>
                      {a.image && (
                        <img src={a.image} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            background: 'var(--bg-accent-subtle)', border: '1px solid var(--accent)',
                            borderRadius: 3, padding: '1px 7px', fontSize: 11,
                            color: 'var(--accent)', fontWeight: 700,
                          }}>{selected}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.source}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {new Date(a.datetime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>{a.headline}</div>
                        {a.summary && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
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
