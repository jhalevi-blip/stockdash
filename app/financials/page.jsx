'use client';
import DemoPrompt from '@/components/DemoPrompt';
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';


const fmt = (n) => {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6)  return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3)  return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(2);
};

const fmtPct = (n) => {
  if (n == null) return '—';
  return (n * 100).toFixed(1) + '%';
};

const pctChange = (curr, prev) => {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const Arrow = ({ val }) => {
  if (val == null) return null;
  return (
    <span style={{ color: val >= 0 ? '#3fb950' : '#f85149', fontSize: 10, marginLeft: 4 }}>
      {val >= 0 ? '▲' : '▼'}{Math.abs(val).toFixed(1)}%
    </span>
  );
};

// ── Row definitions — key maps to our EDGAR response fields ──────────────────

const INCOME_ROWS = [
  { key: 'revenue',     label: 'Revenue' },
  { key: 'grossProfit', label: 'Gross Profit' },
  { key: 'netIncome',   label: 'Net Income' },
  { key: 'eps',         label: 'EPS (Diluted)', isEps: true },
  { key: 'grossMargin', label: 'Gross Margin %', isPct: true },
  { key: 'netMargin',   label: 'Net Margin %', isPct: true },
];

const BALANCE_ROWS = [
  { key: 'assets',      label: 'Total Assets' },
  { key: 'liabilities', label: 'Total Liabilities' },
  { key: 'equity',      label: 'Shareholders Equity' },
];

const CASHFLOW_ROWS = [
  { key: 'operatingCF', label: 'Operating Cash Flow' },
  { key: 'capex',       label: 'Capital Expenditures' },
  { key: 'fcf',         label: 'Free Cash Flow' },
];

// ── Transform EDGAR response into a columnar format ──────────────────────────
// Each column = one fiscal year. Rows = metrics.
function transformData(raw) {
  if (!raw) return null;

  // Derive gross margin, net margin, FCF
  const grossMargin = (raw.grossProfit || []).map((g, i) => {
    const r = raw.revenue?.[i];
    return { year: g.year, value: r?.value ? g.value / r.value : null };
  });

  const netMargin = (raw.netIncome || []).map((n, i) => {
    const r = raw.revenue?.[i];
    return { year: n.year, value: r?.value ? n.value / r.value : null };
  });

  const fcf = (raw.operatingCF || []).map((o, i) => {
    const c = raw.capex?.[i];
    return { year: o.year, value: (o.value != null && c?.value != null) ? o.value - c.value : null };
  });

  return {
    revenue:     raw.revenue     || [],
    grossProfit: raw.grossProfit || [],
    netIncome:   raw.netIncome   || [],
    eps:         raw.eps         || [],
    grossMargin,
    netMargin,
    assets:      raw.assets      || [],
    liabilities: raw.liabilities || [],
    equity:      raw.equity      || [],
    operatingCF: raw.operatingCF || [],
    capex:       raw.capex       || [],
    fcf,
  };
}

// Get array of {year, value} for a given row key from transformed data
function getSeries(transformed, key) {
  return transformed?.[key] || [];
}

// Build columnar table: years across top, rows down side
function buildTable(transformed, rowDefs) {
  if (!transformed) return { years: [], rows: [] };

  // Collect all years across all relevant series
  const allYears = new Set();
  rowDefs.forEach(r => {
    getSeries(transformed, r.key).forEach(d => allYears.add(d.year));
  });
  const years = [...allYears].sort();

  const rows = rowDefs.map(rowDef => {
    const series = getSeries(transformed, rowDef.key);
    const byYear = {};
    series.forEach(d => { byYear[d.year] = d.value; });
    return { ...rowDef, byYear };
  });

  return { years, rows };
}

export default function FinancialsPage() {
  const [tickers,  setTickers]  = useState([]);
  const [selected, setSelected] = useState(null);
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState('income');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      setTickers(stored ? JSON.parse(stored).map(h => h.t) : []);
    } catch { setTickers([]); }
  }, []);

  const loadFinancials = async (ticker) => {
    setSelected(ticker);
    setLoading(true);
    setData(null);
    try {
      // ✅ Fixed: use ?ticker= to match our new EDGAR route
      const res = await fetch(`/api/financials?ticker=${ticker}`);
      const raw = await res.json();
      if (raw.error) throw new Error(raw.error);
      setData(transformData(raw));
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const rowDefs = tab === 'income'   ? INCOME_ROWS
                : tab === 'balance'  ? BALANCE_ROWS
                : CASHFLOW_ROWS;

  const { years, rows } = buildTable(data, rowDefs);

  // Revenue + Net Income chart data
  const revChart = (data?.revenue || []).map((r, i) => ({
    period:       r.year,
    Revenue:      r.value,
    'Net Income': data?.netIncome?.[i]?.value ?? null,
  }));

  const tabs = [
    { key: 'income',   label: 'Income Statement' },
    { key: 'balance',  label: 'Balance Sheet' },
    { key: 'cashflow', label: 'Cash Flow' },
  ];

  return (
    <main style={{ padding: '20px 24px' }}>
      {/* Ticker selector */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Select Stock</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tickers.map(t => (
            <button key={t} onClick={() => loadFinancials(t)} style={{
              background: selected === t ? '#1f6feb' : '#21262d',
              color:      selected === t ? '#fff'    : '#c9d1d9',
              border:     `1px solid ${selected === t ? '#58a6ff' : '#30363d'}`,
              borderRadius: 4, padding: '6px 14px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* States */}
      {tickers.length === 0 && (
        <DemoPrompt message="Add stocks to your portfolio to view financial statements" />
      )}
      {tickers.length > 0 && !selected && (
        <div className="chart-placeholder">Select a stock to view financial statements</div>
      )}
      {loading && (
        <div className="chart-placeholder">Loading financials for {selected}…</div>
      )}
      {!loading && selected && !data && (
        <div className="chart-placeholder">No financial data available for {selected}</div>
      )}

      {/* Main content */}
      {!loading && data && (
        <>
          {/* Revenue & Net Income chart */}
          {revChart.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div className="section-title">{selected} — Revenue & Net Income Trend</div>
              <div className="chart-panel">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={revChart} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="period" tick={{ fill: '#8b949e', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fill: '#8b949e', fontSize: 10 }} tickLine={false} axisLine={false} width={60}
                      tickFormatter={v => v >= 1e9 ? '$'+(v/1e9).toFixed(0)+'B' : '$'+(v/1e6).toFixed(0)+'M'}
                    />
                    <Tooltip
                      contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4 }}
                      labelStyle={{ color: '#8b949e', fontSize: 11 }}
                      formatter={v => fmt(v)}
                    />
                    <Line type="monotone" dataKey="Revenue"    stroke="#58a6ff" strokeWidth={2} dot={{ fill: '#58a6ff', r: 4 }} />
                    <Line type="monotone" dataKey="Net Income" stroke="#3fb950" strokeWidth={2} dot={{ fill: '#3fb950', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tab buttons */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                background: tab === t.key ? '#1f6feb' : '#21262d',
                color:      tab === t.key ? '#fff'    : '#c9d1d9',
                border:     `1px solid ${tab === t.key ? '#58a6ff' : '#30363d'}`,
                borderRadius: 4, padding: '6px 16px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}>{t.label}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#555', letterSpacing: '0.06em' }}>
              SOURCE: SEC EDGAR · ANNUAL 10-K
            </span>
          </div>

          {/* Data table */}
          {years.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="left">Metric</th>
                    {years.map((y, i) => <th key={i}>{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.key}>
                      <td className="left" style={{ color: '#e6edf3', fontWeight: 600 }}>
                        {row.label}
                      </td>
                      {years.map((y, i) => {
                        const val  = row.byYear[y];
                        const prev = i > 0 ? row.byYear[years[i - 1]] : null;
                        const chg  = row.isPct || row.isEps ? null : pctChange(val, prev);

                        let display;
                        if (row.isPct)      display = fmtPct(val);
                        else if (row.isEps) display = val != null ? val.toFixed(2) : '—';
                        else                display = fmt(val);

                        return (
                          <td key={y} className={val != null && val < 0 ? 'neg' : 'neutral'}>
                            {display}
                            {!row.isPct && !row.isEps && <Arrow val={chg} />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="chart-placeholder">No {tab} data available for {selected}</div>
          )}
        </>
      )}
    </main>
  );
}
