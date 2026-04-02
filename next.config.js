const nextConfig = {
  generateBuildId: async () => `build-${Date.now()}`,
  async headers() {
    return [
      {
        // Prices — live, refresh every 30s
        source: '/api/prices',
        headers: [{ key: 'Cache-Control', value: 's-maxage=30, stale-while-revalidate=60' }],
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
        // Health — never cache
        source: '/api/health',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        // Remaining API routes — cache 4 hours
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 's-maxage=14400, stale-while-revalidate=3600' }],
      },
    ];
  },
};

module.exports = nextConfig;
