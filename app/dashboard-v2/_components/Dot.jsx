'use client';

export default function Dot({ color = 'var(--positive-bright)', size = 7, pulse = true }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 0 2px ${color}22`,
      animation: pulse ? 'pulse 2s infinite' : 'none',
    }} />
  );
}
