'use client';
import DemoPrompt from '@/components/DemoPrompt';
import { useState, useEffect } from 'react';
import { getDemoTickers } from '@/lib/startDemo';

const FILING_TYPES = {
  '10-K': '#2563eb', '10-Q': '#16a34a', '8-K': '#d97706', 'DEF 14A': '#7c3aed',
};

export default function ResearchPage() {
  const [tickers,     setTickers]     = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [tab,         setTab]         = useState('filings');
  const [filings,     setFilings]     = useState([]);
  const [news,        setNews]        = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [txLoading,   setTxLoading]   = useState(false);
  const [filterType,  setFilterType]  = useState('all');
  const [expanded,    setExpanded]    = useState({});

  useEffect(() => {
    try {
      // TODO: reads stockdash_holdings without ownership check — a polluted browser
      // may show stale data here. Track: consolidate all unscoped cache reads behind
      // a single ownership-aware getter (dual-table consolidation pass).
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      const t = holdings.map(h => h.t);
      setTickers(t.length ? t : (localStorage.getItem('stockdash_demo') === 'true' ? getDemoTickers() : []));
    } catch {}
  }, []);

  const loadData = async (ticker) => {
    setSelected(ticker);
    setLoading(true);
    setFilings([]); setNews([]); setTranscripts([]); setExpanded({});
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

  const loadTranscripts = async (ticker) => {
    if (transcripts.length) return; // already loaded
    setTxLoading(true);
    try {
      const data = await fetch(`/api/research?symbol=${ticker}&type=transcripts`).then(r => r.json());
      setTranscripts(Array.isArray(data) ? data : []);
    } catch {}
    setTxLoading(false);
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
            {[['filings', '📄 SEC Filings'], ['news', '📰 Latest News'], ['transcripts', '🎙️ Earnings Calls']].map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); if (key === 'transcripts') loadTranscripts(selected); }} style={{
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

          {/* Transcripts tab */}
          {tab === 'transcripts' && (
            <>
              {txLoading ? (
                <div className="chart-placeholder">Loading transcripts for {selected}…</div>
              ) : transcripts.length === 0 ? (
                <div className="chart-placeholder">No transcripts found for {selected}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {transcripts.map((tx, i) => {
                    const isOpen = !!expanded[i];
                    const preview = tx.content?.slice(0, 600) ?? '';
                    return (
                      <div key={i} style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                        borderRadius: 8, padding: '14px 16px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{
                            background: 'var(--bg-accent-subtle)', border: '1px solid var(--accent)',
                            borderRadius: 3, padding: '2px 8px', fontSize: 11,
                            color: 'var(--accent)', fontWeight: 700,
                          }}>Q{tx.quarter} {tx.year}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {tx.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {isOpen ? tx.content : `${preview}${(tx.content?.length ?? 0) > 600 ? '…' : ''}`}
                        </div>
                        {(tx.content?.length ?? 0) > 600 && (
                          <button onClick={() => setExpanded(e => ({ ...e, [i]: !isOpen }))} style={{
                            marginTop: 10, background: 'transparent', border: 'none',
                            color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', padding: 0,
                          }}>
                            {isOpen ? 'Show less ↑' : 'Read full transcript ↓'}
                          </button>
                        )}
                      </div>
                    );
                  })}
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

      {/* Earnings Call Transcripts */}
      {tickers.length > 0 && (
        <div style={{ marginTop: 40, borderTop: '1px solid var(--border-color)', paddingTop: 28 }}>
          <div className="section-title" style={{ marginBottom: 4 }}>Earnings Call Transcripts</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
            Opens transcript on external site — free to read
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tickers.map(ticker => (
              <div key={ticker}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '0.05em' }}>
                  {ticker}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { label: 'Motley Fool', href: `https://www.fool.com/earnings-call-transcripts/?search=${ticker}` },
                    { label: 'Seeking Alpha', href: `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts` },
                    { label: 'Rev.com', href: 'https://www.rev.com/blog/transcript-category/earnings-call-transcripts' },
                  ].map(({ label, href }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11, fontWeight: 600, padding: '4px 10px',
                      borderRadius: 4, textDecoration: 'none',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      background: 'transparent',
                      transition: 'border-color .15s, color .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                      {label}
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M1 9L9 1M9 1H4M9 1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
