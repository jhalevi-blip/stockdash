import '../globals.css';
import { DM_Sans } from 'next/font/google';
import DevModeAnalytics from './DevModeAnalytics';

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  // Resolves relative canonical / OpenGraph URLs across the landing group, so
  // pages no longer hardcode absolute URLs.
  metadataBase: new URL('https://stockdashes.com'),
  title: 'StockDashes — Research your portfolio like a professional',
};

// The root layout (app/layout.jsx) is the ONLY layout that renders <html>/<body>
// and <ClerkProvider>; this group nests inside it. We render just the landing
// font wrapper here. The dark palette is the CSS default (:root carries the dark
// variables), so there is no theme flash. Per-locale <html lang> for the /nl/*
// broker pages is set client-side inside BrokerLanding.
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={dmSans.className}>
      {children}
      <DevModeAnalytics />
    </div>
  );
}
