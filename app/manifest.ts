import type { MetadataRoute } from 'next';

// App Router manifest. Next serves this at /manifest.webmanifest and injects
// <link rel="manifest"> automatically — no manual <link> in the layout.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StockDashes',
    short_name: 'StockDashes',
    description: 'Institutional-quality analysis on every holding — from Claude Opus 4.8.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0d1117',
    theme_color: '#0d1117',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
