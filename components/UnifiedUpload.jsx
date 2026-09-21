'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

const fmt    = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const clr    = (n) => n == null ? '#8b949e' : n >= 0 ? '#3fb950' : '#f85149';
const fmtEur = (n) => n == null ? '—' : (n >= 0 ? '+' : '-') + '€' + fmt(Math.abs(n));
const truncate = (s, max = 28) => s.length > max ? s.slice(0, max - 1) + '…' : s;

const BROKER_LABELS = {
  saxo: 'Saxo Bank', degiro: 'DeGiro', trading212: 'Trading 212',
  ibkr: 'Interactive Brokers', rabobank: 'Rabobank', schwab: 'Charles Schwab',
  generic: 'Generic',
};

function SkipLines({ skipped }) {
  if (!skipped) return null;
  const sk = skipped;
  const lines = [
    (sk.optionsSkipped       ?? 0) > 0 && `${sk.optionsSkipped} options trades skipped`,
    (sk.expirySkipped        ?? 0) > 0 && `${sk.expirySkipped} expiry rows skipped`,
    (sk.dividendsSkipped     ?? 0) > 0 && `${sk.dividendsSkipped} dividend / corporate action rows skipped`,
    (sk.cashTransfersSkipped ?? 0) > 0 && `${sk.cashTransfersSkipped} cash transfer rows skipped`,
    (sk.transfersOutSkipped  ?? 0) > 0 && `${sk.transfersOutSkipped} asset${sk.transfersOutSkipped !== 1 ? 's' : ''} transferred out (excluded)`,
    (sk.fxConversionsSkipped ?? 0) > 0 && `${sk.fxConversionsSkipped} FX conversion${sk.fxConversionsSkipped !== 1 ? 's' : ''} skipped`,
    (sk.fallbackTickers      ?? 0) > 0 && `${sk.fallbackTickers} position${sk.fallbackTickers !== 1 ? 's' : ''} using fund name as ticker: ${sk.fallbackTickersList?.join(', ')}`,
    (sk.corporateActionsSkipped ?? 0) > 0 && `${sk.corporateActionsSkipped} corporate-action row${sk.corporateActionsSkipped !== 1 ? 's' : ''} skipped`,
    (sk.corporateActionsHeld ?? 0) > 0 && `${sk.corporateActionsHeld} corporate-action row${sk.corporateActionsHeld !== 1 ? 's' : ''} excluded (${sk.corporateActionsHeldTypes?.join(', ')})`,
    (sk.netZero              ?? 0) > 0 && `${sk.netZero} position${sk.netZero !== 1 ? 's' : ''} fully closed (net zero, excluded)`,
    (sk.parseErrors          ?? 0) > 0 && `${sk.parseErrors} rows could not be parsed`,
    (sk.sellsWithoutBuys     ?? 0) > 0 && `${sk.sellsWithoutBuys} ticker${sk.sellsWithoutBuys !== 1 ? 's' : ''} had sells without matching buys: ${sk.sellsWithoutBuysTickers?.join(', ')}`,
    (sk.unresolvedIsins      ?? 0) > 0 && `${sk.unresolvedIsins} ISIN${sk.unresolvedIsins !== 1 ? 's' : ''} could not be resolved: ${sk.unresolvedIsinsList?.join(', ')}`,
    (sk.missingTicker        ?? 0) > 0 && `${sk.missingTicker} rows skipped — missing ticker`,
    (sk.tickerTooLong        ?? 0) > 0 && `${sk.tickerTooLong} rows skipped — ticker too long`,
    (sk.invalidShares        ?? 0) > 0 && `${sk.invalidShares} rows skipped — invalid shares`,
    (sk.invalidCost          ?? 0) > 0 && `${sk.invalidCost} rows skipped — invalid cost`,
    sk.columnMappingFailed         && `Could not auto-detect required columns (ticker, shares, cost) — check your file headers`,
  ].filter(Boolean);

  if (!lines.length) return null;
  return (
    <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, fontSize: 12, color: '#8b949e', lineHeight: 1.7 }}>
      {lines.map((line, i) => <li key={i}>{line}</li>)}
    </ul>
  );
}

export default function UnifiedUpload({ onHoldings, onTransactions, startDate, onClose, onPendingChange, existingHoldings = [] }) {
  const [fileList,   setFileList]   = useState([]);
  const [dragOver,   setDragOver]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [results,    setResults]    = useState(null);
  // Default to Append: Replace is destructive, and a routine re-import defaulting
  // to Replace is how a windowed export silently wiped a position held from before
  // the export window. Replace stays one click away, now behind the diff guard below.
  const [importMode, setImportMode] = useState('append');
  // First click on Import in Replace mode only arms this when positions would be
  // dropped; the destructive import proceeds on the second, explicit click.
  const [replaceConfirmArmed, setReplaceConfirmArmed] = useState(false);
  const inputRef = useRef(null);
  const nextId   = useRef(1);

  const processFiles = useCallback(async (list) => {
    if (!list.length) {
      setResults(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = new FormData();
      for (const { file } of list) body.append('file', file);
      if (startDate) body.append('startDate', startDate);

      const res  = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? 'Upload failed');
        setLoading(false);
        return;
      }
      setResults(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [startDate]);

  function addFiles(incoming) {
    const valid = [];
    for (const file of incoming) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext)) {
        setError(`"${file.name}" is not a CSV or XLSX file.`);
        continue;
      }
      valid.push({ id: nextId.current++, name: file.name, file });
    }
    if (!valid.length) return;
    setError(null);
    const next = [...fileList, ...valid];
    setFileList(next);
    processFiles(next);
  }

  function removeFile(id) {
    const next = fileList.filter((f) => f.id !== id);
    setFileList(next);
    if (!next.length) {
      setResults(null);
      setError(null);
    } else {
      setResults(null); // clear stale data during re-fetch window
      processFiles(next);
    }
  }

  // Positions in the current portfolio that a Replace with this upload would drop.
  // A position "leaves" when its ticker is absent from the uploaded file entirely —
  // the OXY case: held from before a windowed export, so it has no rows in the file
  // and would vanish on overwrite with no trace to warn from. The diff compares
  // against what's already in the portfolio, so it catches this even though the
  // file itself carries no signal that the position ever existed.
  const uploadedByTicker = new Map();
  for (const h of results?.holdings ?? []) {
    const t = String(h?.t ?? '').trim().toUpperCase();
    if (!t) continue;
    uploadedByTicker.set(t, (uploadedByTicker.get(t) ?? 0) + (Number(h?.s) || 0));
  }
  const existingByTicker = new Map();
  for (const h of existingHoldings) {
    const t = String(h?.t ?? '').trim().toUpperCase();
    if (!t) continue;
    existingByTicker.set(t, (existingByTicker.get(t) ?? 0) + (Number(h?.s) || 0));
  }
  const removedPositions = importMode === 'replace'
    ? [...existingByTicker.entries()]
        .filter(([t]) => !uploadedByTicker.has(t))
        .map(([t, s]) => ({ t, s }))
    : [];
  // Mirror of the Replace diff for Append: tickers already in the portfolio that
  // this upload will add a SECOND row for. Informational only — separate lots of
  // the same ticker can be legitimate — but silent duplication is how picking the
  // wrong mode quietly doubled a portfolio, so name them before the import.
  const duplicatePositions = importMode === 'append'
    ? [...uploadedByTicker.entries()]
        .filter(([t]) => existingByTicker.has(t))
        .map(([t, s]) => ({ t, s, existing: existingByTicker.get(t) }))
    : [];
  // Armed + still-destructive → the confirm state. The button names what leaves
  // so the acknowledgement is explicit, not a generic "are you sure".
  const confirmingReplace = replaceConfirmArmed && removedPositions.length > 0;
  const removedLabel = removedPositions.slice(0, 3).map((p) => p.t).join(', ')
    + (removedPositions.length > 3 ? ` +${removedPositions.length - 3} more` : '');

  // Any change to the mode or the parsed upload invalidates a prior acknowledgement —
  // the user must re-confirm against the current diff, never a stale one.
  useEffect(() => { setReplaceConfirmArmed(false); }, [importMode, results]);

  function handleImport() {
    if (!results) return;
    // Destructive Replace guard: when Replace would drop existing positions, the
    // first click only arms the confirmation (which names what leaves). The import
    // proceeds on the second, explicit click. Non-destructive imports are unaffected.
    if (removedPositions.length > 0 && !replaceConfirmArmed) {
      setReplaceConfirmArmed(true);
      return;
    }
    if ((results.holdings?.length ?? 0) > 0) {
      // Wrapped object distinguishes this from UploadPanel.onImport's `skipped` parameter.
      // PortfolioModal (File 8) reads fileStats explicitly from this shape.
      onHoldings?.(results.holdings, importMode, { fileStats: results.files });
    }
    if ((results.txCount ?? 0) > 0) {
      onTransactions?.(results);
    }
  }

  const { positions = [], partialPositions = [], totalPnl, totalPnlSinceStart,
          txCount, files: fileStats = [], holdings = [] } = results ?? {};
  const hasHoldings = holdings.length > 0;
  const hasPnL      = txCount > 0;

  useEffect(() => {
    onPendingChange?.(!!results && (hasHoldings || hasPnL));
    return () => onPendingChange?.(false);
  }, [results, hasHoldings, hasPnL]);

  const allRealized = [...positions, ...partialPositions];
  const best  = allRealized.length ? allRealized.reduce((a, b) => b.pnl > a.pnl ? b : a) : null;
  const worst = allRealized.length ? allRealized.reduce((a, b) => b.pnl < a.pnl ? b : a) : null;

  const cardStyle = {
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: 8, padding: '14px 18px', flex: '1 1 160px', minWidth: 0,
  };
  const labelStyle = {
    fontSize: 10, color: '#8b949e', textTransform: 'uppercase',
    letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6,
  };

  return (
    <div>
      {/* ── Drop zone ──────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => !loading && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#22d3ee' : '#30363d'}`,
          borderRadius: 10,
          padding: results ? '18px 24px' : '40px 24px',
          textAlign: 'center',
          cursor: loading ? 'not-allowed' : 'pointer',
          background: dragOver ? 'rgba(34,211,238,0.04)' : 'var(--bg-card)',
          transition: 'border-color 0.15s, background 0.15s',
          marginBottom: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { addFiles(Array.from(e.target.files)); e.target.value = ''; }}
        />
        {loading ? (
          <div style={{ color: '#8b949e', fontSize: 13 }}>
            Processing {fileList.length} file{fileList.length !== 1 ? 's' : ''}…
          </div>
        ) : results ? (
          <div style={{ fontSize: 12, color: '#8b949e' }}>+ Drop or click to add more files</div>
        ) : (
          <>
            <div style={{ fontSize: 30, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              Drop your broker export or holdings CSV / XLSX here
            </div>
            <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>
              Saxo · DeGiro · Trading 212 · IBKR · Rabobank · Schwab · generic holdings snapshot
            </div>
          </>
        )}
      </div>

      {/* ── File chips ─────────────────────────────────────────────────── */}
      {fileList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {fileList.map((f, i) => {
            const stat = fileStats.find((s) => s.name === f.name);
            const badge = stat
              ? `${BROKER_LABELS[stat.format] ?? stat.format} · ${stat.intent}`
              : null;
            return (
              <div key={f.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#21262d', border: '1px solid #30363d',
                borderRadius: 6, padding: '5px 10px', fontSize: 12,
              }}>
                <span style={{ color: '#8b949e', fontWeight: 600, flexShrink: 0 }}>File {i + 1}:</span>
                <span style={{ color: '#c9d1d9' }} title={f.name}>{truncate(f.name)}</span>
                {badge && (
                  <span style={{
                    padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                    background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.3)',
                    color: '#58a6ff',
                  }}>{badge}</span>
                )}
                {stat?.txCount > 0 && (
                  <span style={{ color: '#484f58' }}>({stat.txCount} txs)</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                  style={{
                    background: 'none', border: 'none', color: '#484f58',
                    cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1, borderRadius: 3,
                  }}
                  title="Remove file"
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#484f58'; }}
                >×</button>
              </div>
            );
          })}
          {txCount > 0 && fileList.length > 1 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)',
              borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#22d3ee',
            }}>
              Total: {txCount} transactions
            </div>
          )}
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 6,
          background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)',
          color: '#f85149', fontSize: 13,
        }}>{error}</div>
      )}

      {results && (
        <>
          {/* ── Per-file parse summaries ────────────────────────────────── */}
          {fileStats.map((stat, i) => (
            <div key={i} style={{
              marginBottom: 10, padding: '10px 14px',
              background: 'var(--bg-primary, #0d1117)',
              border: '1px solid var(--border-color)',
              borderRadius: 6, fontSize: 13,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {truncate(stat.name, 40)}
                </span>
                <span style={{
                  padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                  background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.3)',
                  color: '#58a6ff',
                }}>
                  {BROKER_LABELS[stat.format] ?? stat.format} · {stat.intent}
                  {stat.intentConfidence === 'inferred' ? ' (inferred)' : ''}
                  {stat.intentConfidence === 'ambiguous' ? ' (ambiguous)' : ''}
                </span>
                {stat.txCount > 0 && (
                  <span style={{ color: '#8b949e', fontSize: 12 }}>{stat.txCount} transactions</span>
                )}
              </div>
              <SkipLines skipped={stat.skipped} />
              {(stat.skipped?.splitsCounted > 0 || stat.skipped?.distributionsCounted > 0) && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#484f58' }}>
                  {stat.skipped.splitsCounted > 0 && <span>✓ {stat.skipped.splitsCounted} split{stat.skipped.splitsCounted !== 1 ? 's' : ''} processed · </span>}
                  {stat.skipped.distributionsCounted > 0 && <span>✓ {stat.skipped.distributionsCounted} distribution{stat.skipped.distributionsCounted !== 1 ? 's' : ''} processed</span>}
                </div>
              )}
            </div>
          ))}

          {/* ── Replace / Append toggle — only when holdings are present ── */}
          {hasHoldings && (
            <div style={{
              marginBottom: 14, padding: 12,
              background: 'var(--bg-primary, #0d1117)',
              border: '1px solid var(--border-color)',
              borderRadius: 6, fontSize: 13,
            }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>How to import portfolio</div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 6, color: 'var(--text-primary)' }}>
                <input type="radio" name="importMode" value="replace"
                  checked={importMode === 'replace'} onChange={() => setImportMode('replace')}
                  style={{ marginTop: 3, cursor: 'pointer' }} />
                <span><strong>Replace</strong> all current holdings with this upload</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input type="radio" name="importMode" value="append"
                  checked={importMode === 'append'} onChange={() => setImportMode('append')}
                  style={{ marginTop: 3, cursor: 'pointer' }} />
                <span><strong>Append</strong> to existing holdings</span>
              </label>

              {/* Diff-before-destroy: name exactly what a Replace would drop, before it commits. */}
              {removedPositions.length > 0 && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', borderRadius: 6,
                  background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.35)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f85149', marginBottom: 6 }}>
                    ⚠ Replace will remove {removedPositions.length} position{removedPositions.length !== 1 ? 's' : ''} that {removedPositions.length !== 1 ? "aren't" : "isn't"} in this file
                  </div>
                  <ul style={{ margin: '0 0 6px 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                    {removedPositions.map((p) => (
                      <li key={p.t}><strong>{p.t}</strong> — {fmt(p.s, p.s % 1 === 0 ? 0 : 2)} share{p.s === 1 ? '' : 's'}</li>
                    ))}
                  </ul>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>
                    These are held from before this export&apos;s date range. Replace removes them permanently — choose <strong>Append</strong> above to keep them.
                  </div>
                </div>
              )}

              {/* Mirror of the Replace diff for Append: name tickers this upload will add a
                  second row for. Informational only — separate lots are legitimate, so
                  neutral styling and no confirm — but silent duplication is how the wrong
                  mode quietly doubled a portfolio, so surface it before the import. */}
              {duplicatePositions.length > 0 && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', borderRadius: 6,
                  background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.3)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#58a6ff', marginBottom: 6 }}>
                    ℹ Append will add a second row for {duplicatePositions.length} ticker{duplicatePositions.length !== 1 ? 's' : ''} already in your portfolio
                  </div>
                  <ul style={{ margin: '0 0 6px 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                    {duplicatePositions.map((p) => (
                      <li key={p.t}>
                        <strong>{p.t}</strong> — adding {fmt(p.s, p.s % 1 === 0 ? 0 : 2)} share{p.s === 1 ? '' : 's'} (you already hold {fmt(p.existing, p.existing % 1 === 0 ? 0 : 2)})
                      </li>
                    ))}
                  </ul>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>
                    Append keeps existing rows and adds these as separate lots — fine for genuinely separate purchases. If you meant to overwrite, choose <strong>Replace</strong> above.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Holdings summary — compact count, no table pre-import ───── */}
          {hasHoldings && (
            <div style={{
              marginBottom: 14, padding: '10px 14px',
              background: 'var(--bg-primary, #0d1117)',
              border: '1px solid var(--border-color)',
              borderRadius: 6, fontSize: 13, color: 'var(--text-primary)',
            }}>
              <strong>{holdings.length}</strong> position{holdings.length !== 1 ? 's' : ''} ready to save to portfolio
            </div>
          )}

          {/* ── Realized P&L summary cards ──────────────────────────────── */}
          {hasPnL && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
              <div style={{
                ...cardStyle,
                borderColor: totalPnl >= 0 ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)',
              }}>
                <div style={labelStyle}>Total Realized P&L</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: clr(totalPnl), lineHeight: 1 }}>
                  {fmtEur(totalPnl)}
                </div>
                {totalPnlSinceStart != null && (
                  <div style={{ fontSize: 12, color: clr(totalPnlSinceStart), marginTop: 4 }}>
                    Since start: {fmtEur(totalPnlSinceStart)}
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                  {positions.length + partialPositions.length} realized positions · {txCount} transactions
                </div>
              </div>
              {best && (
                <div style={cardStyle}>
                  <div style={labelStyle}>Best Trade</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#3fb950' }}>{best.symbol}</div>
                  <div style={{ fontSize: 13, color: '#3fb950' }}>+€{fmt(best.pnl)}</div>
                </div>
              )}
              {worst && worst !== best && (
                <div style={cardStyle}>
                  <div style={labelStyle}>Worst Trade</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f85149' }}>{worst.symbol}</div>
                  <div style={{ fontSize: 13, color: '#f85149' }}>-€{fmt(Math.abs(worst.pnl))}</div>
                </div>
              )}
            </div>
          )}

          {/* ── Closed positions table ──────────────────────────────────── */}
          {positions.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {['Symbol', 'Shares Sold', 'Cost Basis', 'Proceeds', 'Realized P&L', 'First Buy', 'Last Sell'].map((label) => (
                      <th key={label} className={label === 'Symbol' ? 'left' : ''}
                        style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <tr key={i}>
                      <td className="left" style={{ fontWeight: 700, color: '#e6edf3' }}>{p.symbol}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(p.closedShares, p.closedShares % 1 === 0 ? 0 : 2)}</td>
                      <td style={{ textAlign: 'right', color: '#8b949e' }}>€{fmt(p.totalBoughtEur)}</td>
                      <td style={{ textAlign: 'right' }}>€{fmt(p.totalSoldEur)}</td>
                      <td style={{ textAlign: 'right', color: clr(p.pnl), fontWeight: 700 }}>{fmtEur(p.pnl)}</td>
                      <td style={{ textAlign: 'right', color: '#8b949e', fontSize: 11 }}>{p.firstBuy ?? '—'}</td>
                      <td style={{ textAlign: 'right', color: '#8b949e', fontSize: 11 }}>{p.lastSell ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Partial exits table ─────────────────────────────────────── */}
          {partialPositions.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 20, marginBottom: 8 }}>
                Partial Exits — still holding shares
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {['Symbol', 'Shares Sold', 'Shares Remaining', 'Cost Basis', 'Proceeds', 'Realized P&L', 'Last Sell'].map((label) => (
                        <th key={label} className={label === 'Symbol' ? 'left' : ''}
                          style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {partialPositions.map((p, i) => (
                      <tr key={i}>
                        <td className="left" style={{ fontWeight: 700, color: '#e6edf3' }}>{p.symbol}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(p.closedShares, p.closedShares % 1 === 0 ? 0 : 2)}</td>
                        <td style={{ textAlign: 'right', color: '#8b949e' }}>{fmt(p.remainingShares, p.remainingShares % 1 === 0 ? 0 : 2)}</td>
                        <td style={{ textAlign: 'right', color: '#8b949e' }}>€{fmt(p.totalBoughtEur)}</td>
                        <td style={{ textAlign: 'right' }}>€{fmt(p.totalSoldEur)}</td>
                        <td style={{ textAlign: 'right', color: clr(p.pnl), fontWeight: 700 }}>{fmtEur(p.pnl)}</td>
                        <td style={{ textAlign: 'right', color: '#8b949e', fontSize: 11 }}>{p.lastSell ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Import button ───────────────────────────────────────────── */}
          {(hasHoldings || hasPnL) && (
            <div style={{
              position: 'sticky', bottom: 0, zIndex: 2,
              background: 'var(--bg-card)',
              borderTop: '1px solid var(--border-color)',
              paddingTop: 12, paddingBottom: 12,
              marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10,
            }}>
              {onClose && (
                <button onClick={onClose} style={{
                  background: 'transparent', border: '1px solid var(--border-color)',
                  color: '#8b949e', borderRadius: 6, padding: '10px 18px', fontSize: 13, cursor: 'pointer',
                }}>Cancel</button>
              )}
              <button onClick={handleImport} style={{
                background: confirmingReplace ? '#da3633' : '#58a6ff', color: '#fff', border: 'none',
                borderRadius: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {confirmingReplace
                  ? `Confirm — remove ${removedLabel} and replace →`
                  : hasHoldings && hasPnL
                  ? `Import ${holdings.length} position${holdings.length !== 1 ? 's' : ''} + view P&L →`
                  : hasHoldings
                  ? `Import ${holdings.length} position${holdings.length !== 1 ? 's' : ''} →`
                  : 'Save realized P&L →'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
