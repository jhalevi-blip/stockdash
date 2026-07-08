'use client';

// Extracted from performance/page.jsx so recharts loads in an async chunk (via
// next/dynamic) instead of on the route's critical path. Both charts share this
// single module → one recharts chunk. The PortTooltip / EurTooltip components
// are used only by these charts, so they moved here verbatim. Data + axis
// interval arrive as props. No chart logic changed.
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

/* ─── PortTooltip ────────────────────────────────────────────────────────── */
function PortTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600, lineHeight: 1.7 }}>
          {p.name}: {p.value >= 0 ? '+' : ''}{p.value?.toFixed(2)}%
        </div>
      ))}
    </div>
  );
}

/* ─── EurTooltip ─────────────────────────────────────────────────────────── */
function EurTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ color: payload[0].color, fontWeight: 600 }}>
        EUR/USD: {payload[0].value?.toFixed(4)}
      </div>
    </div>
  );
}

export function PortfolioVsSpyChart({ data, xInterval }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="perfPortGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#58a6ff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="perfSpyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={xInterval} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`} width={52} domain={['auto', 'auto']} />
        <Tooltip content={<PortTooltip />} />
        <Area type="monotone" dataKey="portfolio" name="Portfolio"   stroke="#58a6ff" strokeWidth={2} fill="url(#perfPortGrad)" dot={false} activeDot={{ r: 4 }} />
        <Area type="monotone" dataKey="spy"       name="SPY Mirror" stroke="#4ade80" strokeWidth={2} fill="url(#perfSpyGrad)"  dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function EurUsdChart({ data, eurXInt }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="eurGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={eurXInt} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(3)} width={52} domain={['auto', 'auto']} />
        <Tooltip content={<EurTooltip />} />
        <Area type="monotone" dataKey="rate" name="EUR/USD" stroke="#f59e0b" strokeWidth={2} fill="url(#eurGrad)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
