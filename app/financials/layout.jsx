import NavBar from '@/components/NavBar';
import Sidebar from '@/components/Sidebar';
import DemoBanner from '@/components/DemoBanner';
import UsageBanner from '@/components/UsageBanner';
import DemoTour from '@/components/DemoTour';

// /financials is the last route on the legacy chrome (Sidebar + NavBar). It used
// to get it from the app-wide <AppShell> in the root layout, which decided chrome
// from a usePathname() allowlist. That allowlist is gone; chrome is now folder-based,
// so the legacy chrome lives here, scoped to this route. The v2 app surface has its
// own chrome via app/(v2)/layout.jsx.
export default function FinancialsLayout({ children }) {
  return (
    <>
      <Sidebar />
      <NavBar />
      <DemoBanner />
      <UsageBanner />
      <DemoTour />
      {children}
    </>
  );
}
