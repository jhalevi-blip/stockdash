import { UI_STRINGS } from '@/lib/landing/brokerConfigs';

export default function DTTrustStrip({ lang = 'en' }) {
  const items = UI_STRINGS[lang]?.trust ?? UI_STRINGS.en.trust;
  return (
    <section style={{
      padding: '32px 24px',
      borderTop: '1px solid #1e2530',
      borderBottom: '1px solid #1e2530',
    }}>
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        {items.map(({ icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 14,
              color: icon === '✓' ? '#4ade80' : '#e6edf3',
            }}>
              {icon}
            </span>
            <span style={{ fontSize: 13, color: 'rgba(230,237,243,0.6)', fontWeight: 500 }}>
              {text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
