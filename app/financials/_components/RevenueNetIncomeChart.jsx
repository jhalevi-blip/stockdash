'use client';

// Extracted from financials/page.jsx so recharts loads in an async chunk (via
// next/dynamic) instead of on the route's critical path. Chart JSX is verbatim;
// data + the value formatter arrive as props. No chart logic changed.
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function RevenueNetIncomeChart({ data, fmt }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#58a6ff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="niGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3fb950" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#3fb950" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
        <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={52}
          tickFormatter={v => v >= 1e9 ? '$'+(v/1e9).toFixed(0)+'B' : '$'+(v/1e6).toFixed(0)+'M'}
        />
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12 }}
          labelStyle={{ color: 'var(--text-muted)', fontSize: 11 }}
          formatter={v => fmt(v)}
        />
        <Area type="monotone" dataKey="Revenue"    stroke="#58a6ff" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }} />
        <Area type="monotone" dataKey="Net Income" stroke="#3fb950" strokeWidth={2} fill="url(#niGrad)"  dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
