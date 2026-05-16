'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

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
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [mapping, setMapping] = useState({ ticker: -1, shares: -1, cost: -1, date: -1 });
  const inputRef = useRef(null);

  function handleFile(file) {
    setError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
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
    if (inputRef.current) inputRef.current.value = '';
  }

  const previewRows = rows.slice(0, 5);

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
            We'll parse the file and let you map columns.
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

          {previewRows.length > 0 && (
            <div>
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

                <div style={{
                  marginTop: 14,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}>
                  <button
                    onClick={() => {
                      // Stage D will wire this. For now: log and no-op.
                      if (mapping.ticker < 0 || mapping.shares < 0 || mapping.cost < 0) {
                        alert('Please map Ticker, Shares, and Avg Cost columns.');
                        return;
                      }
                      console.log('Stage C ready. Mapping:', mapping, 'Rows to import:', rows.length);
                      alert('Stage D will wire the actual import. Mapping looks valid.');
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
