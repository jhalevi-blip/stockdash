'use client';
import { useState, useEffect } from 'react';

// Responsive chart height in PIXELS, chosen by viewport width. Shared by the
// /performance ("Invested holdings vs SPY") and /research price charts.
//
// Returns a NUMBER (not a CSS string) so it can be passed straight to Recharts'
// <ResponsiveContainer height={…}>. A definite pixel height sidesteps the
// "width(-1) and height(-1) of chart should be greater than 0" error that a
// percentage height inside a wrapper div produces before layout settles.
//
// SSR-safe: `window` doesn't exist on the server, so state initialises to the
// desktop value and the real viewport is read in an effect after mount.
const DESKTOP = 660;

function heightForWidth(w) {
  // Phones: derive height from width for a ~1.8:1 aspect ratio so a narrow
  // viewport doesn't produce a near-square chart (which compresses the x-axis
  // and exaggerates swings). Clamped to [180, 320] px.
  if (w < 640) return Math.min(320, Math.max(180, Math.round(w / 1.8)));
  if (w < 1024) return 440;  // tablets / small laptops
  return 660;                // desktop
}

export function useChartHeight() {
  const [height, setHeight] = useState(DESKTOP);

  useEffect(() => {
    const update = () => setHeight(heightForWidth(window.innerWidth));
    update(); // sync to the real viewport once mounted
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return height;
}
