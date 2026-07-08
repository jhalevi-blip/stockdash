'use client';

// Extracted from HeroValue so recharts loads in an async chunk (via next/dynamic)
// instead of on the dashboard's critical path. Chart logic is unchanged — the
// former in-component formatters moved here verbatim; inputs arrive as props.
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const AXIS_SYMBOL = { USD: '$', EUR: '€', GBP: '£' };

function fmtXTick(dateStr, range) {
  const d = new Date(dateStr);
  if (range === '1W') return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function fmtKAxis(v, currency = 'USD') {
  const s = AXIS_SYMBOL[currency] ?? '$';
  if (v >= 1000000) return s + (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return s + (v / 1000).toFixed(0) + 'k';
  return s + v;
}

function fmtFullValue(v, currency = 'USD') {
  return v?.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function HeroSparkChart({ sparkData, range = '1M', displayCurrency = 'USD' }) {
  return (
    <div style={{ marginTop: 8, width: '100%', height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sparkData ?? []} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hero-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => fmtXTick(v, range)}
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={30}
          />
          <YAxis
            dataKey="value"
            tickFormatter={(v) => fmtKAxis(v, displayCurrency)}
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={50}
            domain={['dataMin', 'dataMax']}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--text-muted)' }}
            formatter={(v) => [fmtFullValue(v, displayCurrency), 'Portfolio']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#16a34a"
            strokeWidth={2}
            fill="url(#hero-spark-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
