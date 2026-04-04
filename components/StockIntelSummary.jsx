'use client';
import { useState, useCallback, useEffect } from 'react';

const fmt  = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const fmtD = (n, d = 2) => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(Math.abs(n), d) + '%';
const clr  = (n) => n == null ? 'var(--text-secondary)' : n >= 0 ? 'var(--positive)' : 'var(--negative)';
const fmtM = (n) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'T';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'B';
  return '$' + n.toFixed(0) + 'M';
};
const fmtB = (n) => {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n < 0 ? '−' : '') + '$' + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return (n < 0 ? '−' : '') + '$' + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6)  return (n < 0 ? '−' : '') + '$' + (abs / 1e6).toFixed(0) + 'M';
  return '$' + n.toLocaleString();
};

const CODE_LABEL = {
  P: 'Purchase', S: 'Sale', M: 'Open Market', A: 'Award',
  D: 'Disposition', F: 'Tax Withholding', G: 'Gift',
};
const BUY_CODES = new Set(['P', 'M', 'A', 'G']);

function consensusFromUpside(upside) {
  if (upside == null) return null;
  if (upside > 20) return { label: 'Strong Buy', bg: 'var(--bg-buy)',  color: 'var(--text-buy)' };
  if (upside > 8)  return { label: 'Buy',         bg: 'var(--bg-buy)',  color: 'var(--text-buy)' };
  if (upside > -5) return { label: 'Hold',         bg: 'rgba(217,119,6,0.15)', color: '#d97706' };
  return               { label: 'Sell',         bg: 'var(--bg-sell)', color: 'var(--text-sell)' };
}

function calcFcfMargin(finD) {
  // Guard: financials may be an error object {error: '...'} when EDGAR lookup fails
  if (!finD || finD.error || !finD.operatingCF?.length) return null;
  const years = [...finD.operatingCF].map(r => r.year).sort().reverse();
  for (const yr of years) {
    const ocf = finD.operatingCF.find(r => r.year === yr)?.value;
    const cap = finD.capex?.find(r => r.year === yr)?.value ?? 0;
    const rev = finD.revenue?.find(r => r.year === yr)?.value;
    if (ocf != null && rev != null && rev !== 0) {
      return ((ocf - cap) / rev) * 100;
    }
  }
  return null;
}

function Skeleton({ height = 48 }) {
  return <div style={{ height, background: 'var(--border-color)', borderRadius: 4 }} />;
}

function Card({ title, loading, children, span }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      gridColumn: span ? `span ${span}` : undefined,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {title}
      </div>
      {loading ? <Skeleton /> : children}
    </div>
  );
}

function KV({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: valueColor ?? 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function AiSnapshotCard({ ticker, row, analystD, valD, finD, snap, aiLoading, aiError }) {
  const upside = row?.price && analystD?.lastQuarterTarget
    ? ((analystD.lastQuarterTarget - row.price) / row.price) * 100
    : null;
  const consensus = consensusFromUpside(upside);
  // Guard finD — may be an error object when EDGAR lookup fails
  const safeFinD = finD?.error ? null : finD;
  const fcfMargin = calcFcfMargin(safeFinD);

  console.log('[AiSnapshot] valD:', valD, '| finD:', finD, '| fcfMargin:', fcfMargin);

  // Price target range bar
  const low    = analystD?.targetLow;
  const high   = analystD?.targetHigh;
  const target = analystD?.lastQuarterTarget;
  const price  = row?.price;
  let rangePct = null, targetPct = null;
  if (low != null && high != null && price != null && high > low) {
    const span = high - low;
    rangePct  = Math.min(100, Math.max(0, ((price  - low) / span) * 100));
    targetPct = target != null ? Math.min(100, Math.max(0, ((target - low) / span) * 100)) : null;
  }

  const metrics = [
    { label: 'Gross Margin', value: valD?.grossMargin != null ? `${fmt(valD.grossMargin, 1)}%` : '—' },
    { label: 'P/E (TTM)',    value: valD?.peRatio     != null ? `${fmt(valD.peRatio, 1)}x`     : '—' },
    { label: 'FCF Margin',   value: fcfMargin         != null ? `${fmt(fcfMargin, 1)}%`         : '—' },
  ];

  return (
    <div style={{
      gridColumn: '1 / -1',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Header: ticker, price, change, consensus */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.03em' }}>{ticker}</span>
        {price != null && (
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            ${fmt(price)}
          </span>
        )}
        {row?.chgPct != null && (
          <span style={{ fontSize: 13, color: clr(row.chgPct) }}>
            {row.chgPct >= 0 ? '▲' : '▼'} {fmt(Math.abs(row.chgPct), 2)}%
          </span>
        )}
        <span style={{ flex: 1 }} />
        {consensus && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 12,
            background: consensus.bg, color: consensus.color, letterSpacing: '0.04em',
          }}>
            {consensus.label}
          </span>
        )}
      </div>

      {/* Price target range bar */}
      {low != null && high != null && price != null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>
            <span>Low ${fmt(low)}</span>
            {target != null && (
              <span style={{ color: 'var(--accent)' }}>Target ${fmt(target)}</span>
            )}
            <span>High ${fmt(high)}</span>
          </div>
          <div style={{ height: 5, background: 'var(--border-color)', borderRadius: 3, position: 'relative' }}>
            {targetPct != null && (
              <div style={{
                width: `${targetPct}%`, height: '100%',
                background: 'var(--accent)', borderRadius: 3, opacity: 0.3,
              }} />
            )}
            {rangePct != null && (
              <div style={{
                position: 'absolute', top: -2, left: `${rangePct}%`,
                width: 3, height: 9, background: 'var(--text-primary)',
                borderRadius: 2, transform: 'translateX(-50%)',
              }} />
            )}
          </div>
        </div>
      )}

      {/* Key metrics strip — always shown; values fall back to '—' if data unavailable */}
      <div style={{
        display: 'flex',
        width: '100%',
        borderTop: '1px solid var(--border-color)',
        borderBottom: '1px solid var(--border-color)',
        padding: '10px 0',
      }}>
        {metrics.map((m, i) => (
          <div key={m.label} style={{
            flex: '1 1 0',
            minWidth: 0,
            textAlign: 'center',
            borderLeft: i > 0 ? '1px solid var(--border-color)' : 'none',
            padding: '0 8px',
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{m.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* Bull/Bear — skeleton while loading, error state, content when ready */}
      {aiLoading && !snap && <Skeleton height={90} />}
      {!aiLoading && !snap && aiError && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          Unable to load analysis.
        </div>
      )}
      {snap && !snap.error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, minWidth: 0 }}>
            {/* Bull */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Bull Case
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(snap.bullCases ?? []).map((pt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--positive)', flexShrink: 0, marginTop: 1 }}>▲</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Bear */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--negative)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Bear Case
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(snap.bearCases ?? []).map((pt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--negative)', flexShrink: 0, marginTop: 1 }}>▼</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {snap.summary && (
            <div style={{
              fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic',
              borderTop: '1px solid var(--border-color)', paddingTop: 10, lineHeight: 1.5,
            }}>
              {snap.summary}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StockIntelSummary({ holdings, rows }) {
  const [ticker,    setTicker]    = useState('');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [aiSnap,    setAiSnap]    = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(false);

  const selectStock = useCallback(async (t) => {
    if (!t) { setTicker(''); setData(null); setAiSnap(null); setAiLoading(false); setAiError(false); return; }
    setTicker(t);
    setLoading(true);
    setData(null);
    setAiSnap(null);
    setAiLoading(false);
    setAiError(false);

    const [analyst, insider, earningsHist, valuation, peers, financials, news, filings] =
      await Promise.all([
        fetch(`/api/short-interest?tickers=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/insider?tickers=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/earnings-history?symbol=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/valuation?tickers=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/peers?ticker=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/financials?ticker=${t}`).then(r => r.json()).catch(() => null),
        fetch(`/api/news?tickers=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/research?symbol=${t}&type=filings`).then(r => r.json()).catch(() => []),
      ]);

    setData({ analyst, insider, earningsHist, valuation, peers, financials, news, filings });
    setLoading(false);
  }, []);

  // AI snapshot: trigger after main data loads, cache by ticker+date
  useEffect(() => {
    if (!ticker || !data) return;
    let cancelled = false;

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `ai_snap_${ticker}_${today}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setAiSnap(JSON.parse(cached)); return; }
    } catch {}

    setAiLoading(true);
    setAiError(false);

    const analystData = data.analyst?.find?.(a => a.ticker === ticker) ?? null;
    const valData     = data.valuation?.find?.(v => v.ticker === ticker) ?? null;
    // Guard: financials may be an error object {error: '...'} instead of null
    const finData     = data.financials?.error ? null : (data.financials ?? null);
    const currentRow  = rows.find(r => r.t === ticker);

    const reqBody = {
      symbol: ticker,
      price: currentRow?.price ?? null,
      valuation: valData ? {
        peRatio: valData.peRatio, forwardPE: valData.forwardPE,
        grossMargin: valData.grossMargin, netMargin: valData.netMargin,
        evEbitda: valData.evEbitda, marketCap: valData.marketCap,
      } : null,
      financials: finData ? {
        revenue:     finData.revenue?.at(-1)     ?? null,
        netIncome:   finData.netIncome?.at(-1)   ?? null,
        operatingCF: finData.operatingCF?.at(-1) ?? null,
        capex:       finData.capex?.at(-1)       ?? null,
      } : null,
      analyst: analystData ? {
        target:     analystData.lastQuarterTarget ?? null,
        targetHigh: analystData.targetHigh        ?? null,
        targetLow:  analystData.targetLow         ?? null,
        count:      analystData.lastQuarterCount  ?? null,
      } : null,
    };
    console.log('[AiSnapshot] request body:', JSON.stringify(reqBody, null, 2));

    fetch('/api/ai-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    })
      .then(async r => {
        const text = await r.text();
        console.log('[AiSnapshot] raw response (status', r.status + '):', text);
        try { return JSON.parse(text); } catch { return { error: 'Non-JSON response: ' + text.slice(0, 200) }; }
      })
      .then(snap => {
        if (cancelled) return;
        if (snap.error) {
          console.error('[AiSnapshot] error from server:', snap.error);
          setAiError(true);
        } else {
          try { localStorage.setItem(cacheKey, JSON.stringify(snap)); } catch {}
          setAiSnap(snap);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('[AiSnapshot] fetch error:', err);
          setAiError(true);
        }
      })
      .finally(() => { if (!cancelled) setAiLoading(false); });

    return () => { cancelled = true; };
  }, [ticker, data]); // rows intentionally excluded — stale price is fine for AI context

  const row       = rows.find(r => r.t === ticker);
  const analystD  = data?.analyst?.find?.(a => a.ticker === ticker) ?? null;
  const valD      = data?.valuation?.find?.(v => v.ticker === ticker) ?? null;
  const insiders  = (data?.insider ?? []).slice(0, 4);
  const earnHist  = (data?.earningsHist ?? []).slice(-6);
  const peersList = (data?.peers ?? []).slice(0, 5);
  const finD      = data?.financials ?? null;
  const newsList  = (data?.news ?? []).slice(0, 4);
  const filings   = (data?.filings ?? []).slice(0, 4);

  const upside = row?.price && analystD?.lastQuarterTarget
    ? ((analystD.lastQuarterTarget - row.price) / row.price) * 100
    : null;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Stock Intel
        </div>
        <select
          value={ticker}
          onChange={e => selectStock(e.target.value)}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            padding: '5px 10px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {holdings.length === 0
            ? <option value="" disabled>Loading…</option>
            : <>
                <option value="">Select a stock…</option>
                {holdings.map(h => (
                  <option key={h.t} value={h.t}>{h.t}</option>
                ))}
              </>
          }
        </select>
        {ticker && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {row?.price != null ? `$${fmt(row.price)}` : ''}
            {row?.chgPct != null && (
              <span style={{ color: clr(row.chgPct), marginLeft: 6 }}>{fmtD(row.chgPct)}</span>
            )}
          </span>
        )}
      </div>

      {!ticker && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>
          Select a stock above to see a full intelligence brief.
        </div>
      )}

      {ticker && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>

          {/* 0 — AI Snapshot (full width, first) */}
          <AiSnapshotCard
            ticker={ticker}
            row={row}
            analystD={analystD}
            valD={valD}
            finD={finD}
            snap={aiSnap}
            aiLoading={aiLoading}
            aiError={aiError}
          />

          {/* 1 — Position */}
          <Card title="My Position">
            {row ? (
              <>
                <KV label="Shares"        value={fmt(row.s, 0)} />
                <KV label="Avg Cost"      value={`$${fmt(row.costVal / row.s)}`} />
                <KV label="Market Value"  value={row.mktVal != null ? `$${fmt(row.mktVal)}` : '—'} />
                <KV label="P&L"
                  value={row.pnlAmt != null ? `${row.pnlAmt >= 0 ? '+$' : '−$'}${fmt(Math.abs(row.pnlAmt))} (${fmtD(row.pnlPct)})` : '—'}
                  valueColor={clr(row.pnlAmt)}
                />
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No position data</div>
            )}
          </Card>

          {/* 2 — Analyst Target */}
          <Card title="Analyst Target" loading={loading}>
            {analystD ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                    ${fmt(analystD.lastQuarterTarget)}
                  </span>
                  {upside != null && (
                    <span style={{ fontSize: 14, color: clr(upside), fontWeight: 600 }}>
                      {fmtD(upside)}
                    </span>
                  )}
                </div>
                {analystD.lastQuarterCount && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{analystD.lastQuarterCount} analysts · {analystD.source}</div>
                )}
                {analystD.allTimeTarget && analystD.allTimeTarget !== analystD.lastQuarterTarget && (
                  <KV label="All-time avg" value={`$${fmt(analystD.allTimeTarget)}`} />
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No analyst data</div>
            )}
          </Card>

          {/* 3 — Valuation */}
          <Card title="Valuation" loading={loading}>
            {valD ? (
              <>
                <KV label="P/E (TTM)"    value={valD.peRatio    != null ? fmt(valD.peRatio,   1) : '—'} />
                <KV label="Fwd P/E"      value={valD.forwardPE  != null ? fmt(valD.forwardPE, 1) : '—'} />
                <KV label="P/B"          value={valD.pbRatio    != null ? fmt(valD.pbRatio,   1) : '—'} />
                <KV label="P/S"          value={valD.psRatio    != null ? fmt(valD.psRatio,   1) : '—'} />
                <KV label="EV/EBITDA"    value={valD.evEbitda   != null ? fmt(valD.evEbitda,  1) : '—'} />
                <KV label="Market Cap"   value={fmtM(valD.marketCap)} />
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No valuation data</div>
            )}
          </Card>

          {/* 4 — Insider Activity */}
          <Card title="Insider Activity" loading={loading}>
            {insiders.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {insiders.map((ins, i) => {
                  const isBuy = BUY_CODES.has(ins.transactionCode);
                  const label = CODE_LABEL[ins.transactionCode] ?? ins.transactionCode;
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
                      <span style={{
                        padding: '1px 5px', borderRadius: 3, fontWeight: 600, fontSize: 10, flexShrink: 0,
                        background: isBuy ? 'var(--bg-buy)'   : 'var(--bg-sell)',
                        color:      isBuy ? 'var(--text-buy)' : 'var(--text-sell)',
                      }}>
                        {label}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ins.name?.split(' ').slice(-1)[0] ?? ins.name}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                        {ins.change != null ? Math.abs(ins.change).toLocaleString() : ''}
                      </span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        {ins.transactionDate ? ins.transactionDate.slice(5) : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No recent insider activity</div>
            )}
          </Card>

          {/* 5 — Earnings History */}
          <Card title="Earnings History" loading={loading}>
            {earnHist.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {earnHist.map(e => {
                  const beat = e.actual != null && e.estimate != null ? e.actual >= e.estimate : null;
                  return (
                    <div key={e.period} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{e.period?.slice(0, 7)}</span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {e.actual != null ? `$${fmt(e.actual)}` : '—'}
                      </span>
                      {e.estimate != null && (
                        <span style={{ color: 'var(--text-muted)' }}>est ${fmt(e.estimate)}</span>
                      )}
                      {beat != null && (
                        <span style={{ color: beat ? 'var(--positive)' : 'var(--negative)', fontSize: 10, fontWeight: 600 }}>
                          {beat ? '▲ BEAT' : '▼ MISS'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No earnings history</div>
            )}
          </Card>

          {/* 6 — Financials */}
          <Card title="Financials (Annual)" loading={loading}>
            {finD?.revenue?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Revenue</div>
                {finD.revenue.slice(-4).map(r => (
                  <div key={r.year} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{r.year}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{fmtB(r.value)}</span>
                  </div>
                ))}
                {finD.netIncome?.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Net Income</div>
                    {finD.netIncome.slice(-2).map(r => (
                      <div key={r.year} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{r.year}</span>
                        <span style={{ color: clr(r.value) }}>{fmtB(r.value)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No financials data</div>
            )}
          </Card>

          {/* 7 — Peers */}
          <Card title="Peer Comparison" loading={loading} span={2}>
            {peersList.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Ticker', 'Mkt Cap', 'P/E', 'P/B', 'Rev Gr %', 'Net Mg %'].map(h => (
                        <th key={h} style={{ color: 'var(--text-secondary)', fontWeight: 500, textAlign: h === 'Ticker' ? 'left' : 'right', padding: '3px 6px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {peersList.map(p => (
                      <tr key={p.ticker} style={{ background: p.isBase ? 'var(--bg-secondary)' : 'transparent' }}>
                        <td style={{ padding: '4px 6px', color: p.isBase ? 'var(--accent)' : 'var(--text-primary)', fontWeight: p.isBase ? 700 : 400 }}>{p.ticker}</td>
                        <td style={{ padding: '4px 6px', color: 'var(--text-primary)', textAlign: 'right' }}>{fmtM(p.marketCap)}</td>
                        <td style={{ padding: '4px 6px', color: 'var(--text-primary)', textAlign: 'right' }}>{p.peRatio != null ? fmt(p.peRatio, 1) : '—'}</td>
                        <td style={{ padding: '4px 6px', color: 'var(--text-primary)', textAlign: 'right' }}>{p.pbRatio != null ? fmt(p.pbRatio, 1) : '—'}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: clr(p.revenueGrowth) }}>{p.revenueGrowth != null ? fmtD(p.revenueGrowth) : '—'}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: clr(p.netMargin) }}>{p.netMargin != null ? fmtD(p.netMargin) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No peer data</div>
            )}
          </Card>

          {/* 8 — News */}
          <Card title="Recent News" loading={loading}>
            {newsList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {newsList.map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {n.source} · {new Date(n.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{n.headline}</div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No news available</div>
            )}
          </Card>

          {/* 9 — SEC Filings */}
          <Card title="SEC Filings" loading={loading}>
            {filings.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filings.map((f, i) => (
                  <a key={i} href={f.finalLink} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <span style={{
                      fontSize: 11, padding: '1px 6px', borderRadius: 3,
                      background: 'var(--bg-secondary)', color: 'var(--accent)', fontWeight: 600, flexShrink: 0,
                    }}>
                      {f.type}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{f.filingDate}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No filings found</div>
            )}
          </Card>

        </div>
      )}
    </div>
  );
}
