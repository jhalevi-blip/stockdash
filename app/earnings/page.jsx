'use client';
import { useState, useEffect } from 'react';
import DemoPrompt from '@/components/DemoPrompt';
import { getDemoTickers } from '@/lib/startDemo';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';

function getStoredTickers() {
  try {
    // TODO: reads stockdash_holdings without ownership check — a polluted browser
    // may show stale data here. Track: consolidate all unscoped cache reads behind
    // a single ownership-aware getter (dual-table consolidation pass).
    const stored = localStorage.getItem('stockdash_holdings');
    const holdings = stored ? JSON.parse(stored) : [];
    const t = holdings.map(h => h.t);
    if (t.length) return t;
    if (localStorage.getItem('stockdash_demo') === 'true') return getDemoTickers();
  } catch {}
  return [];
}

const f = (n, d=2) => n?.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d }) ?? '—';
const pct = n => n == null ? '—' : (n >= 0 ? '+' : '') + f(n) + '%';

export default function EarningsPage() {
  const [tickers,  setTickers]  = useState([]);
  const [selected, setSelected] = useState(null);
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [nextEarnings, setNextEarnings] = useState(null);

  useEffect(() => { setTickers(getStoredTickers()); }, []);

  const loadEarnings = async (ticker) => {
    setSelected(ticker);
    setLoading(true);
    setNextEarnings(null);
    try {
      const [histRes, calRes] = await Promise.all([
        fetch(`/api/earnings-history?symbol=${ticker}`),
        fetch(`/api/earnings?symbol=${ticker}`),
      ]);
      const raw = await histRes.json();
      const cal = await calRes.json();
      setData(raw.slice(0, 12));
      const next = Array.isArray(cal) ? cal.find(e => e.symbol === ticker) : null;
      setNextEarnings(next || null);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const getStreak = (data) => {
    if (!data.length) return null;
    const sorted = [...data].reverse();
    let streak = 0, type = null;
    for (const e of sorted) {
      if (e.actual == null || e.estimate == null) break;
      const beat = e.actual >= e.estimate;
      if (type === null) type = beat;
      if (beat === type) streak++;
      else break;
    }
    return { streak, type };
  };

  const [sortKey, setSortKey] = useState('period');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const streak = getStreak(data);

  const epsChartData = data.map(e => ({
    period: e.period,
    'EPS Estimate': e.estimate,
    'EPS Actual':   e.actual,
  }));

  const epsTrendData = data.map(e => ({
    period: e.period,
    'EPS Actual': e.actual,
  }));

  const renderCountdown = () => {
    if (!nextEarnings) return null;
    const days = Math.ceil((new Date(nextEarnings.date) - new Date()) / (1000 * 60 * 60 * 24));
    const color = days <= 7 ? '#f85149' : days <= 14 ? '#f0883e' : '#3fb950';
    return (
      <div style={{ background: '#111416', border: `1px solid ${color}`, borderRadius: 6, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>📅</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>
            Next Earnings: {new Date(nextEarnings.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <div style={{ fontSize: 12, color }}>
            {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow!' : `${days} days away`}
            {nextEarnings.hour === 'amc' ? ' · After Market Close' : nextEarnings.hour === 'bmo' ? ' · Before Market Open' : ''}
          </div>
        </div>
      </div>
    );
  };

  const renderStreak = () => {
    if (!streak || streak.streak < 2) return null;
    const color = streak.type ? '#3fb950' : '#f85149';
    return (
      <div style={{ background: '#111416', border: `1px solid ${color}`, borderRadius: 6, padding: '12px 18px', marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>{streak.type ? '🏆' : '⚠️'}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>
            {streak.type ? '🟢 Beat' : '🔴 Missed'} estimates {streak.streak} quarters in a row
          </div>
          <div style={{ fontSize: 11, color: '#8b949e' }}>Based on last {streak.streak} reported quarters</div>
        </div>
      </div>
    );
  };

  return (
    <main style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Select Stock</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tickers.map(t => (
            <button key={t} onClick={() => loadEarnings(t)} style={{
              background: selected === t ? '#1f6feb' : '#21262d',
              color: selected === t ? '#fff' : '#c9d1d9',
              border: `1px solid ${selected === t ? '#58a6ff' : '#30363d'}`,
              borderRadius: 4, padding: '6px 14px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {tickers.length === 0 && <DemoPrompt message="Add stocks to your portfolio to view earnings history" />}
      {tickers.length > 0 && !selected && <div className="chart-placeholder">Select a stock above to view earnings history</div>}
      {loading  && <div className="chart-placeholder">Loading earnings for {selected}…</div>}
      {!loading && selected && data.length === 0 && <div className="chart-placeholder">No earnings data available for {selected}</div>}

      {!loading && data.length > 0 && (
        <>
          {renderCountdown()}
          {renderStreak()}

          <div style={{ marginBottom: 28 }}>
            <div className="section-title">{selected} — EPS Estimate vs Actual</div>
            <div className="chart-panel">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={epsChartData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
                  <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12 }} labelStyle={{ color: 'var(--text-muted)', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
                  <Bar dataKey="EPS Estimate" fill="#58a6ff" radius={[3,3,0,0]} />
                  <Bar dataKey="EPS Actual"   fill="#3fb950" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div className="section-title">{selected} — EPS Trend</div>
            <div className="chart-panel">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={epsTrendData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="epsTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#58a6ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
                  <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12 }} labelStyle={{ color: 'var(--text-muted)', fontSize: 11 }} />
                  <Area type="monotone" dataKey="EPS Actual" stroke="#58a6ff" strokeWidth={2} fill="url(#epsTrendGrad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="section-title">{selected} — Quarterly Detail</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      { key: 'period',          label: 'Period',      align: 'left'  },
                      { key: 'estimate',        label: 'EPS Est',     align: 'right' },
                      { key: 'actual',          label: 'EPS Actual',  align: 'right' },
                      { key: 'surprise',        label: 'EPS Surprise',align: 'right' },
                      { key: 'surprisePct',     label: 'Surprise %',  align: 'right' },
                      { key: 'revenueEstimate', label: 'Rev Est',     align: 'right' },
                      { key: 'revenueActual',   label: 'Rev Actual',  align: 'right' },
                      { key: 'beat',            label: 'Beat?',       align: 'right' },
                    ].map(c => {
                      const active = sortKey === c.key;
                      return (
                        <th
                          key={c.key}
                          className={c.align === 'left' ? 'left' : ''}
                          onClick={() => handleSort(c.key)}
                          style={{
                            cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                            padding: '10px 16px', fontSize: 12, fontWeight: 600,
                            color: active ? '#22d3ee' : 'rgba(255,255,255,0.5)',
                          }}
                        >
                          {c.label} {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {[...data].sort((a, b) => {
                    const getVal = (e, k) => {
                      if (k === 'surprise') return (e.actual != null && e.estimate != null) ? e.actual - e.estimate : null;
                      if (k === 'surprisePct') {
                        const s = (e.actual != null && e.estimate != null) ? e.actual - e.estimate : null;
                        return s != null && e.estimate ? s / Math.abs(e.estimate) * 100 : null;
                      }
                      if (k === 'beat') return (e.actual != null && e.estimate != null) ? (e.actual >= e.estimate ? 1 : 0) : null;
                      return e[k] ?? null;
                    };
                    const av = getVal(a, sortKey) ?? (sortDir === 'desc' ? -Infinity : Infinity);
                    const bv = getVal(b, sortKey) ?? (sortDir === 'desc' ? -Infinity : Infinity);
                    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
                    return sortDir === 'asc' ? av - bv : bv - av;
                  }).map((e, i) => {
                    const surprise = e.actual != null && e.estimate != null ? e.actual - e.estimate : null;
                    const surprisePct = surprise != null && e.estimate ? surprise / Math.abs(e.estimate) * 100 : null;
                    const beat = surprise != null && surprise >= 0;
                    return (
                      <tr key={i}>
                        <td className="left" style={{ fontWeight: 600, color: '#374151' }}>{e.period}</td>
                        <td>{e.estimate != null ? '$' + f(e.estimate) : '—'}</td>
                        <td className={e.actual != null ? (beat ? 'pos' : 'neg') : 'neutral'}>{e.actual != null ? '$' + f(e.actual) : '—'}</td>
                        <td className={surprise != null ? (beat ? 'pos' : 'neg') : 'neutral'}>{surprise != null ? (beat ? '+$' : '-$') + f(Math.abs(surprise)) : '—'}</td>
                        <td className={surprisePct != null ? (beat ? 'pos' : 'neg') : 'neutral'}>{pct(surprisePct)}</td>
                        <td className="neutral">{e.revenueEstimate ? '$' + (e.revenueEstimate/1e9).toFixed(2)+'B' : '—'}</td>
                        <td className={e.revenueActual ? (e.revenueActual >= (e.revenueEstimate||0) ? 'pos' : 'neg') : 'neutral'}>{e.revenueActual ? '$' + (e.revenueActual/1e9).toFixed(2)+'B' : '—'}</td>
                        <td>{surprise != null ? (beat ? '✅' : '❌') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}