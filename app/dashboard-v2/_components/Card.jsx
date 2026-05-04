'use client';

export default function Card({
  title,
  eyebrow,
  action,
  children,
  padding,
  style = {},
  onClick,
  footer,
}) {
  return (
    <section onClick={onClick} style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      cursor: onClick ? 'pointer' : 'default',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      ...style,
    }}>
      {(title || eyebrow || action) && (
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--border-color)',
          minHeight: 40,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {eyebrow && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--accent-cyan)',
              }}>{eyebrow}</span>
            )}
            {title && (
              <h3 style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '-.005em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{title}</h3>
            )}
          </div>
          {action && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{action}</div>
          )}
        </header>
      )}
      <div style={{ padding: padding ?? '14px', flex: 1, minHeight: 0 }}>{children}</div>
      {footer && (
        <footer style={{
          borderTop: '1px solid var(--border-color)',
          padding: '10px 14px',
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}>{footer}</footer>
      )}
    </section>
  );
}
