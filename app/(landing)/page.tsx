import { Suspense } from "react";
import LandingPage from "./landing-page";
import { getSampleMarketData } from "@/lib/landing/sampleMarketData";

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
