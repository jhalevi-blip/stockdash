'use client';
// Per-ticker SEC filings + company news + earnings-call transcripts — the full
// content of the old /financial-filings page, driven by a `ticker` prop instead
// of its own holdings picker. Used as the Stock Research "Filings" tab.
import { useState, useEffect } from 'react';

const FILING_TYPES = {
  '10-K': '#2563eb', '10-Q': 'var(--positive)', '8-K': '#d97706', 'DEF 14A': '#7c3aed',
};

export default function FilingsPanel({ ticker }) {
  const [tab, setTab] = useState('filings'); // filings | news | transcripts
  const [filings, setFilings] = useState([]);
  const [news, setNews] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [expanded, setExpanded] = useState({});

  // Filings + news load together when the ticker changes.
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setFilings([]); setNews([]); setTranscripts([]); setExpanded({});
    Promise.all([
      fetch(`/api/research?symbol=${ticker}&type=filings`).then(r => r.json()),
      fetch(`/api/research?symbol=${ticker}&type=news`).then(r => r.json()),
    ]).then(([fil, nws]) => {
      if (cancelled) return;
      setFilings(Array.isArray(fil) ? fil : []);
      setNews(Array.isArray(nws) ? nws : []);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // Transcripts are heavy — only fetch when the tab is first opened for this ticker.
  const loadTranscripts = async () => {
    if (!ticker || transcripts.length) return;
    setTxLoading(true);
    try {
      const data = await fetch(`/api/research?symbol=${ticker}&type=transcripts`).then(r => r.json());
      setTranscripts(Array.isArray(data) ? data : []);
    } catch {}
    setTxLoading(false);
  };

  const filteredFilings = filterType === 'all' ? filings : filings.filter(f => f.type === filterType);
  const btnBase = { borderRadius: 4, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' };

  if (loading) return <div className="chart-placeholder">Loading filings, news & transcripts for {ticker}…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {[['filings', 'SEC Filings'], ['news', 'Latest News'], ['transcripts', 'Earnings Calls']].map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); if (key === 'transcripts') loadTranscripts(); }} style={{
            ...btnBase,
            background: tab === key ? 'var(--accent-btn)' : 'var(--bg-secondary)',
            color: tab === key ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--border-color)'}`,
          }}>{label}</button>
        ))}
      </div>

      {/* SEC Filings */}
      {tab === 'filings' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['all', '10-K', '10-Q', '8-K'].map(type => (
              <button key={type} onClick={() => setFilterType(type)} style={{
                background: filterType === type ? 'var(--bg-accent-subtle)' : 'transparent',
                color: filterType === type ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${filterType === type ? 'var(--accent)' : 'var(--border-color)'}`,
                borderRadius: 4, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>{type === 'all' ? 'All' : type}</button>
            ))}
          </div>
          {filteredFilings.length === 0 ? (
            <div className="chart-placeholder">No filings found for {ticker}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredFilings.map((f, i) => (
                <a key={i} href={f.finalLink} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px 16px', textDecoration: 'none', transition: 'border-color .2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}>
                  <span style={{
                    background: `color-mix(in srgb, ${FILING_TYPES[f.type] || 'var(--text-muted)'} 12%, var(--bg-card))`,
                    border: `1px solid ${FILING_TYPES[f.type] || 'var(--border-color)'}`,
                    color: FILING_TYPES[f.type] || 'var(--text-muted)',
                    borderRadius: 3, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', minWidth: 50, textAlign: 'center',
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

      {/* Earnings Calls (transcripts) */}
      {tab === 'transcripts' && (
        txLoading ? (
          <div className="chart-placeholder">Loading transcripts for {ticker}…</div>
        ) : transcripts.length === 0 ? (
          <div className="chart-placeholder">No transcripts found for {ticker}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {transcripts.map((tx, i) => {
              const isOpen = !!expanded[i];
              const preview = tx.content?.slice(0, 600) ?? '';
              return (
                <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ background: 'var(--bg-accent-subtle)', border: '1px solid var(--accent)', borderRadius: 3, padding: '2px 8px', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Q{tx.quarter} {tx.year}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {tx.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {isOpen ? tx.content : `${preview}${(tx.content?.length ?? 0) > 600 ? '…' : ''}`}
                  </div>
                  {(tx.content?.length ?? 0) > 600 && (
                    <button onClick={() => setExpanded(e => ({ ...e, [i]: !isOpen }))} style={{ marginTop: 10, background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                      {isOpen ? 'Show less ↑' : 'Read full transcript ↓'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Latest News */}
      {tab === 'news' && (
        news.length === 0 ? (
          <div className="chart-placeholder">No news found for {ticker}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '14px 16px', textDecoration: 'none', transition: 'border-color .2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}>
                {a.image && <img src={a.image} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: 'var(--bg-accent-subtle)', border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 7px', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{ticker}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.source}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {new Date(a.datetime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>{a.headline}</div>
                  {a.summary && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{a.summary.slice(0, 120)}…</div>}
                </div>
              </a>
            ))}
          </div>
        )
      )}

      {/* Earnings-call transcript links (external, free) for the current ticker.
          Kept from the old /financial-filings page so nothing is dropped. */}
      {ticker && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Earnings-call transcripts — external
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Opens the transcript on an external site — free to read
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Motley Fool',   href: `https://www.fool.com/earnings-call-transcripts/?search=${ticker}` },
              { label: 'Seeking Alpha', href: `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts` },
              { label: 'Rev.com',       href: 'https://www.rev.com/blog/transcript-category/earnings-call-transcripts' },
            ].map(({ label, href }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 4, textDecoration: 'none', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'transparent', transition: 'border-color .15s, color .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                {label}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M1 9L9 1M9 1H4M9 1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
