'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { detectBrokerFormat } from '@/lib/brokers/detectFormat';
import { parseSaxo } from '@/lib/brokers/saxo';
import { parseDeGiro } from '@/lib/brokers/degiro';
import { parseTrading212 } from '@/lib/brokers/trading212';
import { parseIBKR } from '@/lib/brokers/ibkr';
import { parseRabobank } from '@/lib/brokers/rabobank';
import { aggregateFIFO } from '@/lib/brokers/fifo';

// Fuzzy match column headers to detect ticker/shares/cost/date columns.
// Returns indexes into the headers array. -1 if no match.
function autoDetect(headers) {
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const find = (patterns) => {
    for (let i = 0; i < headers.length; i++) {
      const h = norm(headers[i]);
      if (patterns.some(p => h.includes(p))) return i;
    }
    return -1;
  };
  return {
    ticker: find(['ticker', 'symbol', 'instrument', 'isin', 'security', 'naam']),
    shares: find(['shares', 'quantity', 'qty', 'aantal', 'positie', 'units']),
    cost:   find(['avgcost', 'costbasis', 'price', 'koers', 'gemkoers', 'avgprice', 'unitprice']),
    date:   find(['datebought', 'purchasedate', 'transactiedatum', 'datum', 'date', 'tradedate']),
  };
}

// Phase G.1 Stage C — file picker + SheetJS parse + raw preview + column mapping.
export default function UploadPanel({ onClose, onImport }) {
  const [fileName, setFileName]       = useState('');
  const [headers, setHeaders]         = useState([]);
  const [rows, setRows]               = useState([]);
  const [error, setError]             = useState('');
  const [mapping, setMapping]         = useState({ ticker: -1, shares: -1, cost: -1, date: -1 });
  const [importMode, setImportMode]   = useState('replace');
  const [detectedBroker, setDetectedBroker] = useState('generic');
  const [brokerResult, setBrokerResult]     = useState(null); // { valid, skipped }
  const inputRef = useRef(null);

  function handleFile(file) {
    setError('');
    setFileName(file.name);
    setBrokerResult(null);
    setDetectedBroker('generic');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // ── Broker format detection ──────────────────────────────────────────
        const format = detectBrokerFormat(wb);
        setDetectedBroker(format);

        if (format === 'trading212') {
          const { trades, skipSummary, splitsCounted, distributionsCounted,
                  transfersOutSkipped } = parseTrading212(wb);
          const { positions, netZeroTickers, sellsWithoutBuysTickers } =
            aggregateFIFO(trades, 'trading212');
          const valid = positions.map(p => ({
            t: p.t, s: p.s, c: p.c, d: p.d ?? '',
            currency: p.currency, broker: 'trading212',
          }));
          setBrokerResult({
            valid,
            skipped: {
              ...skipSummary,
              netZero: netZeroTickers.length,
              sellsWithoutBuys: sellsWithoutBuysTickers.length,
              sellsWithoutBuysTickers,
              transfersOutSkipped,
              splitsCounted,
              distributionsCounted,
            },
          });
          setHeaders([]);
          setRows([]);
          setMapping({ ticker: -1, shares: -1, cost: -1, date: -1 });
          return;
        }

        if (format === 'ibkr') {
          const { trades, skipSummary, unresolvedIsins,
                  fxConversionsSkipped } = await parseIBKR(wb);
          const { positions, netZeroTickers, sellsWithoutBuysTickers } =
            aggregateFIFO(trades, 'ibkr');
          const valid = positions.map(p => ({
            t: p.t, s: p.s, c: p.c, d: p.d ?? '',
            currency: p.currency, broker: 'ibkr',
          }));
          setBrokerResult({
            valid,
            skipped: {
              ...skipSummary,
              netZero: netZeroTickers.length,
              sellsWithoutBuys: sellsWithoutBuysTickers.length,
              sellsWithoutBuysTickers,
              unresolvedIsins: unresolvedIsins.length,
              unresolvedIsinsList: unresolvedIsins,
              fxConversionsSkipped,
            },
          });
          setHeaders([]);
          setRows([]);
          setMapping({ ticker: -1, shares: -1, cost: -1, date: -1 });
          return;
        }

        if (format === 'rabobank') {
          const { trades, skipSummary, unresolvedIsins,
                  fallbackUsedTickers } = await parseRabobank(data);
          const { positions, netZeroTickers, sellsWithoutBuysTickers } =
            aggregateFIFO(trades, 'rabobank');
          const valid = positions.map(p => ({
            t: p.t, s: p.s, c: p.c, d: p.d ?? '',
            currency: p.currency, broker: 'rabobank',
          }));
          setBrokerResult({
            valid,
            skipped: {
              ...skipSummary,
              netZero: netZeroTickers.length,
              sellsWithoutBuys: sellsWithoutBuysTickers.length,
              sellsWithoutBuysTickers,
              unresolvedIsins: unresolvedIsins.length,
              unresolvedIsinsList: unresolvedIsins,
              fallbackTickers: fallbackUsedTickers.length,
              fallbackTickersList: fallbackUsedTickers,
            },
          });
          setHeaders([]);
          setRows([]);
          setMapping({ ticker: -1, shares: -1, cost: -1, date: -1 });
          return;
        }

        if (format === 'saxo') {
          const { trades, skipSummary } = parseSaxo(wb);
          const { positions, netZeroTickers, sellsWithoutBuysTickers } = aggregateFIFO(trades, 'saxo');
          const valid = positions.map(p => ({
            t: p.t, s: p.s, c: p.c, d: p.d ?? '',
            currency: p.currency, broker: 'saxo',
          }));
          setBrokerResult({
            valid,
            skipped: {
              ...skipSummary,
              netZero: netZeroTickers.length,
              sellsWithoutBuys: sellsWithoutBuysTickers.length,
              sellsWithoutBuysTickers,
            },
          });
          setHeaders([]);
          setRows([]);
          setMapping({ ticker: -1, shares: -1, cost: -1, date: -1 });
          return;
        }

        if (format === 'degiro') {
          const { trades, skipSummary, unresolvedIsins } = await parseDeGiro(wb);
          const { positions, netZeroTickers, sellsWithoutBuysTickers } =
            aggregateFIFO(trades, 'degiro');
          const valid = positions.map(p => ({
            t: p.t, s: p.s, c: p.c, d: p.d ?? '',
            currency: p.currency, broker: 'degiro',
          }));
          setBrokerResult({
            valid,
            skipped: {
              ...skipSummary,
              netZero: netZeroTickers.length,
              sellsWithoutBuys: sellsWithoutBuysTickers.length,
              sellsWithoutBuysTickers,
              unresolvedIsins: unresolvedIsins.length,
              unresolvedIsinsList: unresolvedIsins,
            },
          });
          setHeaders([]);
          setRows([]);
          setMapping({ ticker: -1, shares: -1, cost: -1, date: -1 });
          return;
        }

        // ── Generic path (unchanged) ─────────────────────────────────────────
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!json.length) {
          setError('File appears to be empty.');
          return;
        }
        // Find header row — first row with non-empty cells
        let headerIdx = 0;
        for (let i = 0; i < Math.min(json.length, 20); i++) {
          if (json[i].some(c => String(c).trim() !== '')) {
            headerIdx = i;
            break;
          }
        }
        const hdrs = json[headerIdx].map(h => String(h ?? '').trim());
        const dataRows = json.slice(headerIdx + 1).filter(
          r => r.some(c => String(c).trim() !== '')
        );
        setHeaders(hdrs);
        setRows(dataRows);
        setMapping(autoDetect(hdrs));
      } catch (err) {
        console.error('Parse error:', err);
        setError('Could not parse this file. Make sure it is a valid CSV or Excel file.');
        setHeaders([]);
        setRows([]);
        setBrokerResult(null);
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsArrayBuffer(file);
  }

  function onPick(e) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function onDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function reset() {
    setFileName('');
    setHeaders([]);
    setRows([]);
    setError('');
    setMapping({ ticker: -1, shares: -1, cost: -1, date: -1 });
    setDetectedBroker('generic');
    setBrokerResult(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const previewRows = rows.slice(0, 5);

  // Replace/Append toggle — shared between broker and generic paths
  const replaceAppendToggle = (
    <div style={{
      marginTop: 14,
      padding: 12,
      background: 'var(--bg-primary, #0d1117)',
      border: '1px solid var(--border-color, #2a3142)',
      borderRadius: 6,
      fontSize: 13,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted, #6e7681)',
        marginBottom: 8,
      }}>How to import</div>
      <label style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        cursor: 'pointer',
        marginBottom: 6,
        color: 'var(--text-primary, #e6edf3)',
      }}>
        <input
          type="radio"
          name="importMode"
          value="replace"
          checked={importMode === 'replace'}
          onChange={() => setImportMode('replace')}
          style={{ marginTop: 3, cursor: 'pointer' }}
        />
        <span>
          <strong>Replace</strong> all current holdings with the uploaded file
        </span>
      </label>
      <label style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        cursor: 'pointer',
        color: 'var(--text-primary, #e6edf3)',
      }}>
        <input
          type="radio"
          name="importMode"
          value="append"
          checked={importMode === 'append'}
          onChange={() => setImportMode('append')}
          style={{ marginTop: 3, cursor: 'pointer' }}
        />
        <span>
          <strong>Append</strong> uploaded rows on top of existing holdings
        </span>
      </label>
    </div>
  );

  return (
    <div style={{
      margin: '20px 36px',
      padding: 20,
      background: 'var(--bg-card, #1a1f2e)',
      border: '1px solid var(--border-color, #2a3142)',
      borderRadius: 8,
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--accent-cyan, #58a6ff)',
            marginBottom: 4,
          }}>Import</div>
          <h3 style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary, #e6edf3)',
          }}>Upload portfolio from CSV or Excel</h3>
          <p style={{
            margin: '6px 0 0 0',
            fontSize: 13,
            color: 'var(--text-secondary, #8b949e)',
          }}>
            Export from Saxo, DeGiro, Trading 212, or any broker.
            We&apos;ll parse the file and let you map columns.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close upload panel"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color, #2a3142)',
            color: 'var(--text-secondary, #8b949e)',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >Cancel</button>
      </div>

      {!fileName && (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          style={{
            padding: 32,
            border: '2px dashed var(--border-color, #2a3142)',
            borderRadius: 6,
            textAlign: 'center',
            color: 'var(--text-secondary, #8b949e)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>📁</div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            Click to choose a file or drop it here
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6e7681)' }}>
            CSV, XLSX, XLS — most broker exports work
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onPick}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {fileName && (
        <div>
          {/* File info bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--bg-primary, #0d1117)',
            border: '1px solid var(--border-color, #2a3142)',
            borderRadius: 6,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary, #e6edf3)' }}>
              📄 {fileName} {rows.length > 0 && (
                <span style={{ color: 'var(--text-muted, #6e7681)' }}>
                  · {rows.length} row{rows.length !== 1 ? 's' : ''} · {headers.length} column{headers.length !== 1 ? 's' : ''}
                </span>
              )}
              {brokerResult && (
                <span style={{ color: 'var(--text-muted, #6e7681)' }}>
                  · {brokerResult.valid.length} position{brokerResult.valid.length !== 1 ? 's' : ''} parsed
                </span>
              )}
            </div>
            <button
              onClick={reset}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color, #2a3142)',
                color: 'var(--text-secondary, #8b949e)',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >Choose different file</button>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid var(--negative, #f85149)',
              borderRadius: 6,
              color: 'var(--negative, #f85149)',
              fontSize: 13,
              marginBottom: 14,
            }}>{error}</div>
          )}

          {/* ── Saxo / DeGiro / Trading 212 / IBKR / Rabobank broker path ─ */}
          {(detectedBroker === 'saxo' || detectedBroker === 'degiro' || detectedBroker === 'trading212' || detectedBroker === 'ibkr' || detectedBroker === 'rabobank') && brokerResult && (() => {
            const sk = brokerResult.skipped;
            const brokerLabel = detectedBroker === 'saxo' ? 'Saxo Bank'
              : detectedBroker === 'degiro' ? 'DeGiro'
              : detectedBroker === 'trading212' ? 'Trading 212'
              : detectedBroker === 'ibkr' ? 'Interactive Brokers'
              : 'Rabobank';
            const emptyStateMsg = detectedBroker === 'saxo'
              ? 'No positions found — check that this is a Saxo Transactions export'
              : detectedBroker === 'degiro'
              ? 'No positions found — check that this is a DeGiro Transacties export'
              : detectedBroker === 'trading212'
              ? 'No positions found — check that this is a Trading 212 CSV export'
              : detectedBroker === 'ibkr'
              ? 'No positions found — check that this is an IBKR Trades Flex Query export (not Dividends)'
              : 'No positions found — check that this is a Rabobank CSV transaction export';
            const skipLines = [
              (sk.optionsSkipped       ?? 0) > 0 && `${sk.optionsSkipped} options trades skipped`,
              (sk.expirySkipped        ?? 0) > 0 && `${sk.expirySkipped} expiry rows skipped`,
              (sk.dividendsSkipped     ?? 0) > 0 && `${sk.dividendsSkipped} dividend / corporate action rows skipped`,
              (sk.cashTransfersSkipped ?? 0) > 0 && `${sk.cashTransfersSkipped} cash transfer rows skipped`,
              (sk.transfersOutSkipped  ?? 0) > 0 && `${sk.transfersOutSkipped} asset${sk.transfersOutSkipped !== 1 ? 's' : ''} transferred out (excluded)`,
              (sk.fxConversionsSkipped ?? 0) > 0 && `${sk.fxConversionsSkipped} FX conversion${sk.fxConversionsSkipped !== 1 ? 's' : ''} skipped (empty ISIN)`,
              (sk.fallbackTickers     ?? 0) > 0 && `${sk.fallbackTickers} position${sk.fallbackTickers !== 1 ? 's' : ''} using fund name as ticker (no exchange ticker available): ${sk.fallbackTickersList?.join(', ')}`,
              (sk.netZero              ?? 0) > 0 && `${sk.netZero} position${sk.netZero !== 1 ? 's' : ''} fully closed (net zero, excluded)`,
              (sk.parseErrors          ?? 0) > 0 && `${sk.parseErrors} rows could not be parsed`,
              (sk.sellsWithoutBuys     ?? 0) > 0 && `${sk.sellsWithoutBuys} ticker${sk.sellsWithoutBuys !== 1 ? 's' : ''} could not be imported — sells without prior buys (likely bought before this export's date range): ${sk.sellsWithoutBuysTickers?.join(', ')}`,
              (sk.unresolvedIsins      ?? 0) > 0 && `${sk.unresolvedIsins} row${sk.unresolvedIsins !== 1 ? 's' : ''} skipped — ISIN could not be resolved to a ticker: ${sk.unresolvedIsinsList?.join(', ')}`,
            ].filter(Boolean);

            return (
              <div>
                {/* Broker badge */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    background: 'rgba(88, 166, 255, 0.12)',
                    border: '1px solid rgba(88, 166, 255, 0.35)',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '.05em',
                    color: 'var(--accent-cyan, #58a6ff)',
                  }}>Detected format: {brokerLabel}</span>
                </div>

                {/* Parse summary */}
                <div style={{
                  padding: '12px 14px',
                  background: 'var(--bg-primary, #0d1117)',
                  border: '1px solid var(--border-color, #2a3142)',
                  borderRadius: 6,
                  marginBottom: 4,
                }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary, #e6edf3)',
                    marginBottom: skipLines.length ? 8 : 0,
                  }}>
                    {brokerResult.valid.length > 0
                      ? `${brokerResult.valid.length} position${brokerResult.valid.length !== 1 ? 's' : ''} ready to import`
                      : emptyStateMsg}
                  </div>
                  {skipLines.length > 0 && (
                    <ul style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12,
                      color: 'var(--text-secondary, #8b949e)',
                      lineHeight: 1.7,
                    }}>
                      {skipLines.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                  )}
                  {((sk.splitsCounted ?? 0) > 0 || (sk.distributionsCounted ?? 0) > 0) && (
                    <div style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: '1px solid var(--border-color, #2a3142)',
                      fontSize: 11,
                      color: 'var(--text-muted, #6e7681)',
                    }}>
                      {(sk.splitsCounted ?? 0) > 0 && <div>✓ {sk.splitsCounted} stock split{sk.splitsCounted !== 1 ? 's' : ''} processed</div>}
                      {(sk.distributionsCounted ?? 0) > 0 && <div>✓ {sk.distributionsCounted} stock distribution{sk.distributionsCounted !== 1 ? 's' : ''} processed</div>}
                    </div>
                  )}
                </div>

                {brokerResult.valid.length > 0 && (
                  <div>
                    {replaceAppendToggle}
                    <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => onImport(brokerResult.valid, importMode, brokerResult.skipped)}
                        style={{
                          background: 'var(--accent-cyan, #58a6ff)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '10px 18px',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Import {brokerResult.valid.length} position{brokerResult.valid.length !== 1 ? 's' : ''} →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Generic path (and DeGiro stub) ───────────────────────────── */}
          {detectedBroker !== 'saxo' && previewRows.length > 0 && (
            <div>
              {/* Badge for detected-but-not-yet-parsed formats (e.g. DeGiro stub) */}
              {detectedBroker !== 'generic' && (
                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    background: 'rgba(88, 166, 255, 0.12)',
                    border: '1px solid rgba(88, 166, 255, 0.35)',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '.05em',
                    color: 'var(--accent-cyan, #58a6ff)',
                  }}>
                    Detected format: {detectedBroker === 'degiro' ? 'DeGiro' : detectedBroker}
                    <span style={{ fontWeight: 400, opacity: 0.75 }}> — map columns below</span>
                  </span>
                </div>
              )}

              <div style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted, #6e7681)',
                marginBottom: 8,
              }}>Preview (first 5 rows)</div>
              <div style={{
                overflowX: 'auto',
                border: '1px solid var(--border-color, #2a3142)',
                borderRadius: 6,
                WebkitOverflowScrolling: 'touch',
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                  color: 'var(--text-primary, #e6edf3)',
                }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-primary, #0d1117)' }}>
                      {headers.map((h, i) => (
                        <th key={i} style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--text-secondary, #8b949e)',
                          borderBottom: '1px solid var(--border-color, #2a3142)',
                          whiteSpace: 'nowrap',
                        }}>{h || `Column ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, ri) => (
                      <tr key={ri}>
                        {headers.map((_, ci) => (
                          <td key={ci} style={{
                            padding: '8px 12px',
                            borderBottom: ri < previewRows.length - 1 ? '1px solid var(--border-color, #2a3142)' : 'none',
                            whiteSpace: 'nowrap',
                          }}>{String(r[ci] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted, #6e7681)',
                  marginBottom: 10,
                }}>Map columns</div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                }}>
                  {[
                    { key: 'ticker', label: 'Ticker', required: true },
                    { key: 'shares', label: 'Shares', required: true },
                    { key: 'cost',   label: 'Avg Cost (per share)', required: true },
                    { key: 'date',   label: 'Date Bought', required: false },
                  ].map(({ key, label, required }) => (
                    <div key={key}>
                      <label style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--text-secondary, #8b949e)',
                        marginBottom: 6,
                      }}>{label}{required && <span style={{ color: 'var(--negative, #f85149)' }}> *</span>}</label>
                      <select
                        value={mapping[key]}
                        onChange={(e) => setMapping(m => ({ ...m, [key]: parseInt(e.target.value, 10) }))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'var(--bg-primary, #0d1117)',
                          border: '1px solid var(--border-color, #2a3142)',
                          borderRadius: 6,
                          color: 'var(--text-primary, #e6edf3)',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <option value={-1}>— Select column —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {replaceAppendToggle}

                <div style={{
                  marginTop: 14,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}>
                  <button
                    onClick={() => {
                      if (mapping.ticker < 0 || mapping.shares < 0 || mapping.cost < 0) {
                        alert('Please map Ticker, Shares, and Avg Cost columns.');
                        return;
                      }
                      const skipped = { missingTicker: 0, tickerTooLong: 0, invalidShares: 0, invalidCost: 0 };
                      const valid = rows.map(r => {
                        const tRaw = r[mapping.ticker];
                        const sRaw = r[mapping.shares];
                        const cRaw = r[mapping.cost];
                        const dRaw = mapping.date >= 0 ? r[mapping.date] : '';

                        const t = String(tRaw ?? '').trim().toUpperCase();
                        const sNum = parseFloat(String(sRaw ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
                        const cNum = parseFloat(String(cRaw ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
                        let d = '';
                        if (dRaw) {
                          const parsedDate = new Date(dRaw);
                          if (!isNaN(parsedDate.getTime())) d = parsedDate.toISOString().slice(0, 10);
                        }

                        if (!t) { skipped.missingTicker++; return null; }
                        if (t.length > 10) { skipped.tickerTooLong++; return null; }
                        if (isNaN(sNum) || sNum <= 0) { skipped.invalidShares++; return null; }
                        if (isNaN(cNum) || cNum < 0) { skipped.invalidCost++; return null; }
                        return { t, s: sNum, c: cNum, d };
                      }).filter(Boolean);

                      if (valid.length === 0) {
                        const reasons = [
                          skipped.missingTicker  && `${skipped.missingTicker} missing ticker`,
                          skipped.tickerTooLong  && `${skipped.tickerTooLong} ticker too long`,
                          skipped.invalidShares  && `${skipped.invalidShares} invalid shares`,
                          skipped.invalidCost    && `${skipped.invalidCost} invalid cost`,
                        ].filter(Boolean).join(', ');
                        alert(`No valid rows found. Reasons: ${reasons || 'unknown'}.\nCheck that the columns you mapped contain ticker symbols, numeric shares, and numeric prices.`);
                        return;
                      }
                      onImport(valid, importMode, skipped);
                    }}
                    style={{
                      background: 'var(--accent-cyan, #58a6ff)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '10px 18px',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >Confirm import →</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
