'use client';
import { useEffect, useState } from 'react';
import { getDemoTickers } from '@/lib/startDemo';

const f   = (n, d=2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const pct = n => n == null ? '—' : (n * 100).toFixed(1) + '%';
const fmt  = n => n == null ? '—' : n >= 1e9 ? '$' + (n/1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n/1e6).toFixed(1) + 'M' : '$' + f(n, 0);
// fmtK: input is in thousands USD (SEC 13F format) — 1e6 thousands = $1B, 1e3 thousands = $1M
const fmtK = n => n == null ? '—' : n >= 1e6 ? '$' + (n/1e6).toFixed(2) + 'B' : n >= 1e3 ? '$' + (n/1e3).toFixed(1) + 'M' : '$' + f(n, 0);

// Build portfolio keywords dynamically from localStorage ticker names
function getPortfolioKeywords() {
  try {
    const stored = localStorage.getItem('stockdash_holdings');
    return stored ? JSON.parse(stored).map(h => h.t) : [];
  } catch { return []; }
}

export default function InstitutionalPage() {
  const [inst,         setInst]         = useState([]);
  const [insider,      setInsider]      = useState([]);
  const [funds,        setFunds]        = useState([]);
  const [tickers,      setTickers]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(null);
  const [selectedFund, setSelectedFund] = useState(0);

  useEffect(() => {
    let storedTickers = [];
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      storedTickers = stored ? JSON.parse(stored).map(h => h.t) : [];
      if (!storedTickers.length && localStorage.getItem('stockdash_demo') === 'true') {
        storedTickers = getDemoTickers();
      }
    } catch {}
    setTickers(storedTickers);
    const tp = storedTickers.join(',');
    Promise.all([
      fetch(tp ? `/api/institutional?tickers=${tp}` : '/api/institutional').then(r => r.json()),
      fetch(tp ? `/api/insider?tickers=${tp}` : '/api/insider').then(r => r.json()),
      fetch('/api/funds').then(r => r.json()),
    ]).then(([instData, insiderData, fundsData]) => {
      setInst(Array.isArray(instData)   ? instData   : []);
      setInsider(Array.isArray(insiderData) ? insiderData : []);
      setFunds(Array.isArray(fundsData) ? fundsData  : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Aggregate insider by ticker, last 90 days
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

  const insiderRows = inst.map(r => ({
    ticker: r.ticker,
    name:   r.name,
    ...(insiderByTicker[r.ticker] || { netShares: 0, netValue: 0 }),
  })).sort((a, b) => b.netShares - a.netShares);

  const activeFund = funds[selectedFund];

  if (loading) return <main style={{ padding: 24 }}><div className="chart-placeholder">Loading ownership data…</div></main>;

  return (
    <main style={{ padding: '20px 24px' }}>

      {/* ── INSIDER BUYING SUMMARY ── */}
      <section style={{ marginBottom: 36 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Insider Buying Summary — Last 90 Days</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="left">Ticker</th>
                <th className="left">Name</th>
                <th>Net Shares</th>
                <th>Net Value</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {insiderRows.map(r => {
                const buying  = r.netShares > 0;
                const selling = r.netShares < 0;
                const color   = buying ? '#3fb950' : selling ? '#f85149' : '#8b949e';
                return (
                  <tr key={r.ticker}>
                    <td className="left" style={{ fontWeight: 700, color: '#e6edf3' }}>{r.ticker}</td>
                    <td className="left" style={{ fontSize: 12, color: '#8b949e' }}>{r.name}</td>
                    <td style={{ color, fontWeight: 600 }}>
                      {r.netShares === 0 ? '—' : (buying ? '+' : '') + r.netShares.toLocaleString()}
                    </td>
                    <td style={{ color, fontWeight: 600 }}>
                      {r.netValue === 0 ? '—' : (buying ? '+' : '') + fmt(Math.abs(r.netValue))}
                    </td>
                    <td style={{ color, fontSize: 12 }}>
                      {buying ? '▲ Buying' : selling ? '▼ Selling' : 'No activity'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#484f58', marginTop: 8 }}>Based on available insider transactions. P = purchase, S = sale.</div>
      </section>

      {/* ── INSTITUTIONAL OWNERSHIP ── */}
      <section style={{ marginBottom: 36 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Institutional Ownership</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="left">Ticker</th>
                <th className="left">Name</th>
                <th>Inst. Owned %</th>
                <th># Institutions</th>
                <th>Insider %</th>
                <th>Top Holder</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inst.map(r => (
                <>
                  <tr key={r.ticker} style={{ cursor: r.top5?.length ? 'pointer' : 'default' }}
                    onClick={() => r.top5?.length && setExpanded(expanded === r.ticker ? null : r.ticker)}>
                    <td className="left" style={{ fontWeight: 700, color: '#e6edf3' }}>{r.ticker}</td>
                    <td className="left" style={{ fontSize: 12, color: '#8b949e' }}>{r.name}</td>
                    <td style={{ fontWeight: 600, color: r.institutionsPctHeld > 0.7 ? '#3fb950' : '#e6edf3' }}>
                      {pct(r.institutionsPctHeld)}
                    </td>
                    <td className="neutral">{r.institutionsCount?.toLocaleString() ?? '—'}</td>
                    <td className="neutral">{pct(r.insidersPctHeld)}</td>
                    <td style={{ fontSize: 12, color: '#8b949e' }}>{r.top5?.[0]?.name ?? '—'}</td>
                    <td style={{ color: '#484f58', fontSize: 11 }}>
                      {r.top5?.length ? (expanded === r.ticker ? '▲' : '▼') : ''}
                    </td>
                  </tr>
                  {expanded === r.ticker && r.top5.map((h, i) => (
                    <tr key={r.ticker + i} style={{ background: '#0d1117' }}>
                      <td colSpan={2} style={{ paddingLeft: 32, fontSize: 12, color: '#8b949e' }}>
                        {i + 1}. {h.name}
                      </td>
                      <td style={{ fontSize: 12, color: '#79c0ff' }}>{pct(h.pctHeld)}</td>
                      <td style={{ fontSize: 12, color: '#8b949e' }}>{h.shares?.toLocaleString() ?? '—'} shares</td>
                      <td style={{ fontSize: 12, color: '#8b949e' }}>{fmtK(h.value)}</td>
                      <td colSpan={2} />
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#484f58', marginTop: 8 }}>Source: Yahoo Finance. Click a row to expand top 5 institutional holders.</div>
      </section>

      {/* ── FUND HOLDINGS (13F) ── */}
      <section>
        <div className="section-title" style={{ marginBottom: 12 }}>Fund Holdings — 13F Filings</div>

        {/* Fund tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {funds.map((fund, i) => (
            <button key={fund.cik} onClick={() => setSelectedFund(i)} style={{
              background: selectedFund === i ? '#1f6feb' : '#21262d',
              color:      selectedFund === i ? '#fff'    : '#c9d1d9',
              border:     `1px solid ${selectedFund === i ? '#58a6ff' : '#30363d'}`,
              borderRadius: 4, padding: '6px 14px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer',
            }}>
              {fund.manager}
            </button>
          ))}
        </div>

        {activeFund && (
          <>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12, display: 'flex', gap: 16 }}>
              <span style={{ fontWeight: 600, color: '#e6edf3' }}>{activeFund.name}</span>
              {activeFund.filingDate && <span>Latest 13F: {activeFund.filingDate}</span>}
              {activeFund.totalValue && <span>Portfolio: {fmt(activeFund.totalValue)}</span>}
              {activeFund.holdings?.length === 0 && <span style={{ color: '#f85149' }}>No data available</span>}
            </div>

            {activeFund.holdings?.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="left">#</th>
                      <th className="left">Company</th>
                      <th>Shares</th>
                      <th>Market Value</th>
                      <th>% of Portfolio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeFund.holdings.map((h, i) => {
                      // TODO: overlap detection removed — ticker substring matching caused false positives
                      // (e.g. "NNE" matching "BRIGHTHOUSE FINL INC"). Needs proper ticker-to-CUSIP or
                      // ticker-to-company-name mapping before re-enabling.
                      return (
                        <tr key={i}>
                          <td className="left" style={{ color: '#484f58', fontSize: 12 }}>{i + 1}</td>
                          <td className="left" style={{ color: '#c9d1d9', fontSize: 13 }}>{h.name}</td>
                          <td className="neutral">{h.shares?.toLocaleString() ?? '—'}</td>
                          <td style={{ fontWeight: 600, color: '#e6edf3' }}>{fmt(h.value)}</td>
                          <td>{pct(h.pctPortfolio)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <div style={{ fontSize: 11, color: '#484f58', marginTop: 8 }}>
          Source: SEC EDGAR 13F-HR filings. Values in USD.
        </div>
      </section>
    </main>
  );
}
