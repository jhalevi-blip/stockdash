'use client';

// Extracted from earnings/page.jsx so recharts loads in an async chunk (via
// next/dynamic) instead of on the route's critical path. Both charts share this
// single module → one recharts chunk. Chart JSX is verbatim; data via props.
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, AreaChart, Area,
} from 'recharts';

export function EpsEstimateVsActualChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
        <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12 }} labelStyle={{ color: 'var(--text-muted)', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
        <Bar dataKey="EPS Estimate" fill="#58a6ff" radius={[3, 3, 0, 0]} />
        <Bar dataKey="EPS Actual"   fill="#3fb950" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EpsTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
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
  );
}
