'use client';
import { usePathname } from 'next/navigation';
import NavBar from './NavBar';
import Sidebar from './Sidebar';
import DemoBanner from './DemoBanner';
import UsageBanner from './UsageBanner';
import DemoTour from './DemoTour';

const AUTH_PATHS = ['/sign-up', '/login', '/'];

export default function AppShell() {
  const path = usePathname();
  if (AUTH_PATHS.some(p => path === p || path.startsWith(p + '/'))) return null;
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
