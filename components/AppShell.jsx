'use client';
import { usePathname } from 'next/navigation';
import NavBar from './NavBar';
import Sidebar from './Sidebar';
import DemoBanner from './DemoBanner';
import UsageBanner from './UsageBanner';
import DemoTour from './DemoTour';
import { ROUTES } from '@/app/(v2)/_lib/routes';

// The legacy chrome (Sidebar + NavBar) renders from the ROOT layout, so it paints on
// every route — including ones that already own their chrome, which would double the
// nav. Every app/(v2)/* page brings its own Sidebar/Topbar via (v2)/layout.jsx.
//
// We can't detect route-group membership at runtime: Next.js strips the "(v2)" group
// from the URL, so usePathname() returns "/screen" whether the file is app/(v2)/screen
// or app/screen — a client component has no way to tell them apart. Instead we derive
// the v2 path set from ROUTES, the SAME registry the v2 sidebar is built from. A new v2
// page must be registered there to get a nav link anyway, so it now suppresses the
// legacy chrome automatically — this file no longer needs editing per page. (Previously
// the v2 list was hand-duplicated here, and /screen was added to the nav but not here,
// which is what double-rendered its nav.)
const V2_PATHS = [...new Set(Object.values(ROUTES).filter(v => typeof v === 'string'))];

// Non-v2 routes that own their chrome or need no legacy nav (auth + marketing; not in
// ROUTES, so listed explicitly).
const STANDALONE_PATHS = ['/sign-in', '/sign-up', '/', '/test-upload'];

const NO_CHROME_PATHS = [...STANDALONE_PATHS, ...V2_PATHS];

export default function AppShell() {
  const path = usePathname();
  if (NO_CHROME_PATHS.some(p => path === p || path.startsWith(p + '/'))) return null;
  return (
    <>
      <Sidebar />
      <NavBar />
      <DemoBanner />
      <UsageBanner />
      <DemoTour />
    </>
  );
}
