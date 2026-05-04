// Route map for the v2 dashboard. Mirrors components/NavBar.jsx exactly.
// Short Interest lives at /analyst — confirmed against the live NavBar.
export const ROUTES = {
  dashboard:    '/dashboard',
  performance:  '/performance',
  macro:        '/macro',
  insider:      '/insider',
  ownership:    '/institutional',
  peers:        '/peers',
  research:     '/research',
  valuation:    '/valuation',
  earnings:     '/earnings',
  analyst:      '/analyst-ratings',
  shorts:       '/analyst',
  blog:         '/blog',
  stock:        (t) => `/research?ticker=${t}`,
  earningsFor:  (t) => `/earnings?ticker=${t}`,
  analystFor:   (t) => `/analyst-ratings?ticker=${t}`,
  insiderFor:   (t) => `/insider?ticker=${t}`,
  shortsFor:    (t) => `/analyst?ticker=${t}`,
  ownershipFor: (t) => `/institutional?ticker=${t}`,
  peersFor:     (t) => `/peers?ticker=${t}`,
  valuationFor: (t) => `/valuation?ticker=${t}`,
};

export const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',       emoji: '📊', href: ROUTES.dashboard },
  { id: 'performance', label: 'Performance',     emoji: '📈', href: ROUTES.performance },
  { id: 'macro',       label: 'Macro',           emoji: '🌏', href: ROUTES.macro },
  { id: 'insider',     label: 'Insider',         emoji: '🔎', href: ROUTES.insider },
  { id: 'ownership',   label: 'Ownership',       emoji: '🏛', href: ROUTES.ownership },
  { id: 'peers',       label: 'Peers',           emoji: '📋', href: ROUTES.peers },
  { id: 'research',    label: 'Research',        emoji: '📑', href: ROUTES.research },
  { id: 'valuation',   label: 'Valuation',       emoji: '📐', href: ROUTES.valuation },
  { id: 'earnings',    label: 'Earnings',        emoji: '📅', href: ROUTES.earnings },
  { id: 'analyst',     label: 'Analyst Ratings', emoji: '🎯', href: ROUTES.analyst },
  { id: 'shorts',      label: 'Short Interest',  emoji: '📉', href: ROUTES.shorts },
  { id: 'blog',        label: 'Blog',            emoji: '📝', href: ROUTES.blog },
];

export function resolveRoute(target) {
  if (!target) return '/dashboard';
  if (typeof target === 'string') return ROUTES[target] || target;
  const { id, ticker } = target;
  if (ticker) {
    const fn = {
      earnings:  ROUTES.earningsFor,
      analyst:   ROUTES.analystFor,
      insider:   ROUTES.insiderFor,
      shorts:    ROUTES.shortsFor,
      ownership: ROUTES.ownershipFor,
      peers:     ROUTES.peersFor,
      valuation: ROUTES.valuationFor,
      research:  ROUTES.stock,
      stock:     ROUTES.stock,
    }[id];
    if (fn) return fn(ticker);
  }
  return ROUTES[id] || '/dashboard';
}
