// Route map for the v2 dashboard. Mirrors components/NavBar.jsx exactly.
// Short Interest lives at /analyst — confirmed against the live NavBar.
export const ROUTES = {
  dashboard:    '/dashboard',
  watchlist:    '/watchlist',
  performance:  '/performance',
  macro:        '/macro',
  insider:      '/insider',
  ownership:    '/ownership',
  peers:        '/peers',
  correlations: '/correlations',
  research:     '/financial-filings',
  researchPage: '/research',
  news:         '/news',
  themes:       '/themes',
  valuation:    '/valuation',
  earnings:     '/earnings',
  analyst:          '/ratings-and-shorts',
  shorts:           '/ratings-and-shorts',
  ratingsAndShorts: '/ratings-and-shorts',
  blog:         '/blog',
  stock:        (t) => `/research?ticker=${t}`,
  researchFor:  (t) => `/research?ticker=${t}`,
  earningsFor:  (t) => `/earnings?ticker=${t}`,
  analystFor:   (t) => `/analyst-ratings?ticker=${t}`,
  insiderFor:   (t) => `/insider?ticker=${t}`,
  shortsFor:    (t) => `/analyst?ticker=${t}`,
  ownershipFor: (t) => `/ownership?ticker=${t}`,
  peersFor:     (t) => `/peers?ticker=${t}`,
  valuationFor: (t) => `/valuation?ticker=${t}`,
};

// Grouped navigation (desktop sidebar + mobile drawer render group headers).
// Financial Filings and Peers are NOT here — they are folded into Stock Research
// as tabs (/research#filings, /research#peers); their old routes redirect there.
// Icons are keyed by `id` in NavIcon; labels drive the visible text + tooltips.
export const NAV_GROUPS = [
  {
    label: 'My Portfolio',
    items: [
      { id: 'dashboard',        label: 'Dashboard',        href: ROUTES.dashboard },
      { id: 'performance',      label: 'Performance',      href: ROUTES.performance },
      { id: 'correlations',     label: 'Correlations',     href: ROUTES.correlations },
    ],
  },
  {
    label: 'Scan My Holdings',
    items: [
      { id: 'valuation',        label: 'Valuation',        href: ROUTES.valuation },
      { id: 'earnings',         label: 'Earnings',         href: ROUTES.earnings },
      { id: 'insider',          label: 'Insider',          href: ROUTES.insider },
      { id: 'ownership',        label: 'Ownership',        href: ROUTES.ownership },
      { id: 'ratingsAndShorts', label: 'Analyst & Shorts', href: ROUTES.ratingsAndShorts },
    ],
  },
  {
    label: 'Research & Ideas',
    items: [
      { id: 'stock-research',   label: 'Stock Research',     href: ROUTES.researchPage },
      { id: 'watchlist',        label: 'Watchlist & Screen', href: ROUTES.watchlist },
      { id: 'themes',           label: 'Theme Research',     href: ROUTES.themes },
    ],
  },
  {
    label: 'Markets',
    items: [
      { id: 'macro',            label: 'Macro',            href: ROUTES.macro },
      { id: 'news',             label: 'News',             href: ROUTES.news },
    ],
  },
  {
    label: 'Learn',
    items: [
      { id: 'blog',             label: 'Blog',             href: ROUTES.blog },
    ],
  },
];

// Flat list (used by the smoke test + visual-QA route walkers). Derived from the
// groups so it always matches the visible nav.
export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

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
      research:        ROUTES.stock,
      stock:           ROUTES.stock,
      'stock-research': ROUTES.researchFor,
    }[id];
    if (fn) return fn(ticker);
  }
  return ROUTES[id] || '/dashboard';
}
