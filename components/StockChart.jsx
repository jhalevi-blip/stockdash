'use client';
import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
export default function StockChart({ ticker }) {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    fetch(`/api/chart?symbol=${ticker}`)
      .then(r => r.json())
      .then(d => setCandles(d.candles || []))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (!ticker) return <div className="chart-placeholder">Click any row to view 1-year chart</div>;
  if (loading)  return <div className="chart-placeholder">Loading chart for {ticker}…</div>;
  if (!candles.length) return <div className="chart-placeholder">No chart data available for {ticker}</div>;

  const first = candles[0]?.close;
  const last  = candles[candles.length - 1]?.close;
  const isUp  = last >= first;
  const color = isUp ? '#58a6ff' : '#f87171';

  return (
    <div className="chart-panel">
      <div className="chart-title">{ticker} — 1 Year Price</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={candles} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis domain={['auto','auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={v => '$' + v.toFixed(0)} width={52} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12 }}
            labelStyle={{ color: 'var(--text-muted)', fontSize: 11 }}
            itemStyle={{ color: color }}
            formatter={v => ['$' + v.toFixed(2), 'Close']}
          />
          <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#cg)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}