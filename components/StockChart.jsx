'use client';
import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useChartTheme } from '@/lib/useChartTheme';

export default function StockChart({ ticker }) {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const theme = useChartTheme();

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
  const color = isUp ? '#3fb950' : '#f85149';

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
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis dataKey="date" tick={{ fill: theme.axis, fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis domain={['auto','auto']} tick={{ fill: theme.axis, fontSize: 10 }} tickLine={false} axisLine={false}
            tickFormatter={v => '$' + v.toFixed(0)} width={50} />
          <Tooltip
            contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 4 }}
            labelStyle={{ color: theme.tooltipLabel, fontSize: 11 }}
            itemStyle={{ color: color }}
            formatter={v => ['$' + v.toFixed(2), 'Close']}
          />
          <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#cg)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}