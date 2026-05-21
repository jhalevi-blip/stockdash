'use client';
import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import DemoPrompt from '@/components/DemoPrompt';
import { getDemoTickers } from '@/lib/startDemo';

/* ─── Formatters ────────────────────────────────────────────────────────── */
const f    = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const pct  = n => n == null ? '—' : (n * 100).toFixed(1) + '%';
const fmt  = n => n == null ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + f(n, 0);
const fmtK = n => n == null ? '—' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'B' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'M' : '$' + f(n, 0);

/* ─── Shared table styles ───────────────────────────────────────────────── */
const thBase = {
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border-color)',
};

const tdBase = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--border-color)',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 13,
};

const stickyTh = {
  ...thBase,
  position: 'sticky',
  left: 0,
  zIndex: 2,
  textAlign: 'left',
  paddingLeft: 16,
};

function stickyTd(extra = {}) {
  return {
    ...tdBase,
    position: 'sticky',
    left: 0,
    zIndex: 1,
    background: 'var(--bg-card)',
    textAlign: 'left',
    paddingLeft: 16,
    ...extra,
  };
}

/* ─── Sort header helper ─────────────────────────────────────────────────── */
function SortTh({ label, sortKey, sortState, onSort, align = 'right' }) {
  const active = sortState.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        ...thBase,
        textAlign: align,
        paddingLeft: align === 'left' ? 16 : 14,
        color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
      }}
    >
      {label} {active ? (sortState.dir === 'desc' ? '↓' : '↑') : '↕'}
    </th>
  );
}

/* ─── Section label ──────────────────────────────────────────────────────── */
const sectionLabel = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.07em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: 10,
};

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function OwnershipV2Page() {
  const { isLoaded, isSignedIn } = useUser();

  // null = Clerk not yet resolved; [] = resolved but empty (signed-in, no portfolio)
  const [tickers,      setTickers]      = useState(null);
  const [inst,         setInst]         = useState([]);
  const [insider,      setInsider]      = useState([]);
  const [funds,        setFunds]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [expanded,     setExpanded]     = useState(null);
  const [selectedFund, setSelectedFund] = useState(0);
  const [insSort,      setInsSort]      = useState({ key: 'netShares', dir: 'desc' });
  const [instSort,     setInstSort]     = useState({ key: 'institutionsPctHeld', dir: 'desc' });

  const handleInsSort  = key => setInsSort(s => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : 'desc' }));
  const handleInstSort = key => setInstSort(s => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : 'desc' }));

  // Resolve tickers once Clerk auth state is known.
  // Logged-out + no portfolio → getDemoTickers() always (show data + nudge)
  // Signed-in  + no portfolio → [] → DemoPrompt (they should add holdings)
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const stored   = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      let ts = holdings.map(h => h.t);
      if (!ts.length && !isSignedIn) ts = getDemoTickers();
      setTickers(ts);
    } catch {
      setTickers(!isSignedIn ? getDemoTickers() : []);
    }
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all three APIs once tickers are resolved and non-empty.
  useEffect(() => {
    if (!tickers?.length) return;
    const tp = tickers.join(',');
    setLoading(true);
    Promise.all([
      fetch(`/api/institutional?tickers=${tp}`).then(r => r.json()),
      fetch(`/api/insider?tickers=${tp}`).then(r => r.json()),
      fetch('/api/funds').then(r => r.json()),
    ]).then(([instData, insiderData, fundsData]) => {
      setInst(Array.isArray(instData)     ? instData     : []);
      setInsider(Array.isArray(insiderData) ? insiderData : []);
      setFunds(Array.isArray(fundsData)   ? fundsData    : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [tickers?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Insider aggregation — last 90 days, P/S only ─────────────────────── */
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const insiderByTicker = insider.reduce((acc, t) => {
    if (new Date(t.transactionDate) < cutoff) return acc;
    const isBuy  = t.transactionCode === 'P';
    const isSell = t.transactionCode === 'S';
    if (!isBuy && !isSell) return acc;
    if (!acc[t.ticker]) acc[t.ticker] = { netShares: 0, netValue: 0 };
    const shares = isBuy ? (t.change || 0) : -(t.change || 0);
    acc[t.ticker].netShares += shares;
    acc[t.ticker].netValue  += shares * (t.transactionPrice || 0);
    return acc;
  }, {});

  /* ── Derived sorted rows ──────────────────────────────────────────────── */
  const insiderRows = inst.map(r => ({
    ticker: r.ticker,
    name:   r.name,
    ...(insiderByTicker[r.ticker] || { netShares: 0, netValue: 0 }),
  })).sort((a, b) => {
    const av = a[insSort.key] ?? (insSort.dir === 'desc' ? -Infinity : Infinity);
    const bv = b[insSort.key] ?? (insSort.dir === 'desc' ? -Infinity : Infinity);
    if (typeof av === 'string') return insSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return insSort.dir === 'asc' ? av - bv : bv - av;
  });

  const instRows = [...inst].sort((a, b) => {
    const av = a[instSort.key] ?? (instSort.dir === 'desc' ? -Infinity : Infinity);
    const bv = b[instSort.key] ?? (instSort.dir === 'desc' ? -Infinity : Infinity);
    if (typeof av === 'string') return instSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return instSort.dir === 'asc' ? av - bv : bv - av;
  });

  const activeFund = funds[selectedFund];

  return (
    <div style={{
      padding: '18px 20px',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>

      {/* ── Page heading ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 2 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
        }}>
          Analysis
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          Ownership
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 600 }}>
          Institutional holders, insider activity, and top fund positions across your portfolio.
        </p>
      </div>

      {/* ── Sign-in nudge ────────────────────────────────────────────────── */}
      {isLoaded && !isSignedIn && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Not seeing your portfolio?{' '}
          <a href="/sign-in" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>
            Sign in
          </a>{' '}
          to load your holdings.
        </div>
      )}

      {/* ── DemoPrompt — signed-in with no portfolio ──────────────────────── */}
      {tickers !== null && tickers.length === 0 && (
        <DemoPrompt message="Add stocks to your portfolio to view institutional ownership data" />
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {tickers !== null && tickers.length > 0 && loading && (
        <div className="chart-placeholder">Loading ownership data…</div>
      )}

      {tickers !== null && tickers.length > 0 && !loading && (
        <>

          {/* ══ SECTION 1: Insider Buying Summary ════════════════════════ */}
          <div>
            <div style={sectionLabel}>Insider Buying Summary — Last 90 Days</div>
            <div className="dv2-valuation-scroll">
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th
                      onClick={() => handleInsSort('ticker')}
                      style={{
                        ...stickyTh,
                        color: insSort.key === 'ticker' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      }}
                    >
                      Ticker {insSort.key === 'ticker' ? (insSort.dir === 'desc' ? '↓' : '↑') : '↕'}
                    </th>
                    <SortTh label="Name"       sortKey="name"      sortState={insSort} onSort={handleInsSort} align="left" />
                    <SortTh label="Net Shares" sortKey="netShares" sortState={insSort} onSort={handleInsSort} />
                    <SortTh label="Net Value"  sortKey="netValue"  sortState={insSort} onSort={handleInsSort} />
                    <th style={{ ...thBase, textAlign: 'right', color: 'var(--text-secondary)', cursor: 'default' }}>
                      Activity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {insiderRows.map(r => {
                    const buying  = r.netShares > 0;
                    const selling = r.netShares < 0;
                    const color   = buying ? '#3fb950' : selling ? '#f85149' : 'var(--text-muted)';
                    return (
                      <tr key={r.ticker}>
                        <td style={stickyTd({ fontWeight: 700, color: 'var(--accent)' })}>
                          {r.ticker}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)' }}>
                          {r.name}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', fontWeight: 600, color }}>
                          {r.netShares === 0 ? '—' : (buying ? '+' : '') + r.netShares.toLocaleString('en-US')}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', fontWeight: 600, color }}>
                          {r.netValue === 0 ? '—' : (buying ? '+' : '') + fmt(Math.abs(r.netValue))}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', fontSize: 12, color }}>
                          {buying ? '▲ Buying' : selling ? '▼ Selling' : 'No activity'}
                        </td>
                      </tr>
                    );
                  })}
                  {insiderRows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        No data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Based on available insider transactions. P = purchase, S = sale.
            </div>
          </div>

          {/* ══ SECTION 2: Institutional Ownership ═══════════════════════ */}
          <div>
            <div style={sectionLabel}>Institutional Ownership</div>
            <div className="dv2-valuation-scroll">
              <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th
                      onClick={() => handleInstSort('ticker')}
                      style={{
                        ...stickyTh,
                        color: instSort.key === 'ticker' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      }}
                    >
                      Ticker {instSort.key === 'ticker' ? (instSort.dir === 'desc' ? '↓' : '↑') : '↕'}
                    </th>
                    <SortTh label="Name"            sortKey="name"                sortState={instSort} onSort={handleInstSort} align="left" />
                    <SortTh label="Inst. Owned %"   sortKey="institutionsPctHeld" sortState={instSort} onSort={handleInstSort} />
                    <SortTh label="# Institutions"  sortKey="institutionsCount"   sortState={instSort} onSort={handleInstSort} />
                    <SortTh label="Insider %"       sortKey="insidersPctHeld"     sortState={instSort} onSort={handleInstSort} />
                    <th style={{ ...thBase, textAlign: 'left', color: 'var(--text-secondary)', cursor: 'default' }}>Top Holder</th>
                    <th style={{ ...thBase, cursor: 'default' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {instRows.map(r => (
                    <React.Fragment key={r.ticker}>
                      <tr
                        style={{ cursor: r.top5?.length ? 'pointer' : 'default' }}
                        onClick={() => r.top5?.length && setExpanded(expanded === r.ticker ? null : r.ticker)}
                      >
                        <td style={stickyTd({ fontWeight: 700, color: 'var(--accent)' })}>
                          {r.ticker}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)' }}>
                          {r.name}
                        </td>
                        <td style={{
                          ...tdBase, textAlign: 'right', fontWeight: 600,
                          color: r.institutionsPctHeld > 0.7 ? '#3fb950' : 'var(--text-primary)',
                        }}>
                          {pct(r.institutionsPctHeld)}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {r.institutionsCount?.toLocaleString('en-US') ?? '—'}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {pct(r.insidersPctHeld)}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)' }}>
                          {r.top5?.[0]?.name ?? '—'}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>
                          {r.top5?.length ? (expanded === r.ticker ? '▲' : '▼') : ''}
                        </td>
                      </tr>
                      {expanded === r.ticker && r.top5.map((h, i) => (
                        <tr key={r.ticker + '_h' + i} style={{ background: 'var(--bg-hover)' }}>
                          <td colSpan={2} style={{
                            ...tdBase,
                            textAlign: 'left',
                            paddingLeft: 32,
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            position: 'sticky',
                            left: 0,
                            background: 'var(--bg-hover)',
                          }}>
                            {i + 1}. {h.name}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', fontSize: 12, color: '#79c0ff' }}>
                            {pct(h.pctHeld)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {h.shares?.toLocaleString('en-US') ?? '—'} shares
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {fmtK(h.value)}
                          </td>
                          <td colSpan={2} style={{ borderBottom: '1px solid var(--border-color)' }} />
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  {instRows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        No data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Source: Yahoo Finance. Click a row to expand top 5 institutional holders.
            </div>
          </div>

          {/* ══ SECTION 3: Fund Holdings ══════════════════════════════════ */}
          <div>
            <div style={sectionLabel}>Fund Holdings — 13F Filings</div>

            {/* Fund picker */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {funds.map((fund, i) => (
                <button key={fund.cik} onClick={() => setSelectedFund(i)} style={{
                  background:   selectedFund === i ? 'var(--accent)'     : 'var(--bg-secondary)',
                  color:        selectedFund === i ? '#fff'              : 'var(--text-secondary)',
                  border:       `1px solid ${selectedFund === i ? 'var(--accent)' : 'var(--border-color)'}`,
                  borderRadius: 4,
                  padding:      '6px 14px',
                  fontSize:     12,
                  fontWeight:   600,
                  cursor:       'pointer',
                }}>
                  {fund.manager}
                </button>
              ))}
            </div>

            {activeFund && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activeFund.name}</span>
                  {activeFund.filingDate && <span>Latest 13F: {activeFund.filingDate}</span>}
                  {activeFund.totalValue && <span>Portfolio: {fmt(activeFund.totalValue)}</span>}
                  {activeFund.holdings?.length === 0 && <span style={{ color: '#f85149' }}>No data available</span>}
                </div>

                {activeFund.holdings?.length > 0 && (
                  <div className="dv2-valuation-scroll">
                    <table style={{ width: '100%', minWidth: 540, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ ...stickyTh, color: 'var(--text-secondary)', cursor: 'default' }}>Company</th>
                          <th style={{ ...thBase, textAlign: 'right', color: 'var(--text-secondary)', cursor: 'default' }}>#</th>
                          <th style={{ ...thBase, textAlign: 'right', color: 'var(--text-secondary)', cursor: 'default' }}>Shares</th>
                          <th style={{ ...thBase, textAlign: 'right', color: 'var(--text-secondary)', cursor: 'default' }}>Market Value</th>
                          <th style={{ ...thBase, textAlign: 'right', color: 'var(--text-secondary)', cursor: 'default' }}>% Portfolio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeFund.holdings.map((h, i) => (
                          <tr key={i}>
                            <td style={stickyTd({ color: 'var(--text-primary)', fontSize: 13 })}>
                              {h.name}
                            </td>
                            <td style={{ ...tdBase, textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                              {i + 1}
                            </td>
                            <td style={{ ...tdBase, textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {h.shares?.toLocaleString('en-US') ?? '—'}
                            </td>
                            <td style={{ ...tdBase, textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {fmt(h.value)}
                            </td>
                            <td style={{ ...tdBase, textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {pct(h.pctPortfolio)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Source: SEC EDGAR 13F-HR filings. Values in USD.
            </div>
          </div>

        </>
      )}

      {/* ── Footer disclaimer ────────────────────────────────────────────── */}
      {tickers !== null && tickers.length > 0 && !loading && (
        <div style={{
          marginTop: 8,
          padding: '14px 0 24px',
          color: 'var(--text-faint, rgba(230,237,243,0.45))',
          fontSize: 11,
          textAlign: 'center',
          borderTop: '1px solid var(--border-section, var(--border-color))',
        }}>
          Institutional data via Yahoo Finance · Fund holdings via SEC EDGAR 13F filings ·
          StockDashes is for informational purposes only and does not constitute financial advice
        </div>
      )}

    </div>
  );
}
