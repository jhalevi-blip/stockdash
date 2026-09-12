// Routes that must stay crawlable (200) but out of the search index: the whole
// signed-in app surface, the portfolio-scoped /financials tool, the dev upload
// route, and the auth pages. noindex drops them from the index; nofollow stops
// crawlers walking the in-app Sidebar links from one route into the rest (that's
// how Google reached all 15 app routes from a single landing-page link).
// Public pages (/, /degiro, /nl/degiro, /saxo, /blog, /blog/*, /privacy) are
// deliberately NOT listed and stay indexable.
const NOINDEX_PATHS = [
  // (v2) app surface — all 15
  '/correlations', '/dashboard', '/earnings', '/financial-filings', '/insider',
  '/macro', '/news', '/ownership', '/peers', '/performance', '/ratings-and-shorts',
  '/research', '/themes', '/valuation', '/watchlist',
  // portfolio-scoped tool (needs your holdings; DemoPrompt to logged-out) — not public
  '/financials',
  // dev/test route
  '/test-upload',
];
const NOINDEX_HEADER = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const nextConfig = {
  generateBuildId: async () => `build-${Date.now()}`,
  // Required: prevents 308 redirect on POST /ingest/e → /ingest/e/ which
  // strips the request body and silently drops events.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      // Order matters: static and decide must precede the catch-all.
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://eu.i.posthog.com/decide',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
    ];
  },
  async headers() {
    return [
      // Keep the signed-in app surface + auth pages crawlable but out of the index.
      ...NOINDEX_PATHS.map((source) => ({ source, headers: NOINDEX_HEADER })),
      // Auth pages are catch-all routes ([[...sign-in]]) — cover base + any subpath.
      { source: '/sign-in/:path*', headers: NOINDEX_HEADER },
      { source: '/sign-up/:path*', headers: NOINDEX_HEADER },
      {
        // Prices — live, 60s TTL to match the route's Finnhub quote revalidate
        source: '/api/prices',
        headers: [{ key: 'Cache-Control', value: 's-maxage=60, stale-while-revalidate=30' }],
      },
      {
        // Financials — changes quarterly, cache 7 days
        source: '/api/financials',
        headers: [{ key: 'Cache-Control', value: 's-maxage=604800, stale-while-revalidate=86400' }],
      },
      {
        // Earnings history — changes quarterly, cache 7 days
        source: '/api/earnings-history',
        headers: [{ key: 'Cache-Control', value: 's-maxage=604800, stale-while-revalidate=86400' }],
      },
      {
        // Valuation metrics — changes daily, cache 6 hours
        source: '/api/valuation',
        headers: [{ key: 'Cache-Control', value: 's-maxage=21600, stale-while-revalidate=3600' }],
      },
      {
        // Analyst targets — changes weekly, cache 24 hours
        source: '/api/short-interest',
        headers: [{ key: 'Cache-Control', value: 's-maxage=86400, stale-while-revalidate=3600' }],
      },
      {
        // Macro indices — changes hourly, cache 1 hour
        source: '/api/macro',
        headers: [{ key: 'Cache-Control', value: 's-maxage=3600, stale-while-revalidate=600' }],
      },
      {
        // Performance data — changes daily, cache 4 hours
        source: '/api/performance',
        headers: [{ key: 'Cache-Control', value: 's-maxage=14400, stale-while-revalidate=3600' }],
      },
      {
        // Chart data — changes daily, cache 4 hours
        source: '/api/chart',
        headers: [{ key: 'Cache-Control', value: 's-maxage=14400, stale-while-revalidate=3600' }],
      },
      {
        // Video files — correct MIME type + long cache
        source: '/:path*.mp4',
        headers: [
          { key: 'Content-Type', value: 'video/mp4' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Health — never cache
        source: '/api/health',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        // Service worker — never cache so SW updates propagate immediately
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        // Stock intel preview — AI-generated, cache 24 hours
        source: '/api/stock-intel-preview',
        headers: [{ key: 'Cache-Control', value: 's-maxage=86400, stale-while-revalidate=3600' }],
      },
      // CDN caching is OPT-IN. There is intentionally NO catch-all rule here.
      // A route gets shared/CDN caching ONLY if it is listed explicitly above
      // (public, non-auth routes) or sets its own Cache-Control header in the
      // handler (which takes precedence over these rules). Auth-gated and
      // user-scoped routes must NEVER receive s-maxage by default — a shared
      // directive on per-user data risks stale reads and cross-user leaks — so
      // they are simply omitted and fall through to the handler's own headers.
    ];
  },
};

module.exports = nextConfig;
