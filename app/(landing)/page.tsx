import { Suspense } from "react";
import LandingPage from "./landing-page";
import { getSampleMarketData } from "@/lib/landing/sampleMarketData";

const TITLE = 'StockDashes — See your real DEGIRO & Saxo return, free';
const DESCRIPTION =
  'Drop your DEGIRO or Saxo export and see your real, time-weighted return — historical FX handled, benchmarked, with AI research on every holding. Free, EU-hosted, nothing uploaded.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    siteName: 'StockDashes',
    type: 'website',
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

// ISR: regenerate at most every 15 min, shared across all visitors. The slow
// tier (fundamentals/earnings, 86400s) is cached separately at the fetch level,
// so those providers are only hit ~once/day even though the page revalidates
// every 900s. Market data is baked into the initial HTML — no client fetch.
export const revalidate = 900;

export default async function Page() {
  const market = await getSampleMarketData();
  return (
    <Suspense fallback={null}>
      <LandingPage market={market} />
    </Suspense>
  );
}
