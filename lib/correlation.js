/**
 * Pure correlation math utilities. No fetching, no side effects.
 */

/**
 * Compute daily returns from a price series sorted ascending by date.
 * Returns array of length N-1 where N is the number of valid input prices.
 *
 * @param {Array<{date: string, close: number}>} prices — sorted ascending
 * @returns {number[]}
 */
export function calculateDailyReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const curr = prices[i];
    if (!prev?.close || !curr?.close || prev.close === 0) continue;
    returns.push((curr.close - prev.close) / prev.close);
  }
  return returns;
}

/**
 * Compute a Pearson correlation matrix across multiple tickers.
 * Aligns return series by date — only trading days present in ALL tickers are used.
 *
 * @param {Array<{ticker: string, prices: Array<{date: string, close: number}>}>} pricesByTicker
 * @returns {{ tickers: string[], matrix: number[][], alignedDateRange: {start, end, count} } | null}
 */
export function calculateCorrelationMatrix(pricesByTicker) {
  if (!Array.isArray(pricesByTicker) || pricesByTicker.length === 0) return null;

  // For each ticker, build a date → daily-return map.
  // Key is the "to" date of the return (prices[i].date), so dates are alignable.
  const returnMaps = pricesByTicker.map(({ ticker, prices }) => {
    const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map();
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (!prev?.close || !curr?.close || prev.close === 0) continue;
      map.set(curr.date, (curr.close - prev.close) / prev.close);
    }
    return { ticker, map };
  });

  // Intersection of all date sets
  let commonDates = new Set(returnMaps[0].map.keys());
  for (let i = 1; i < returnMaps.length; i++) {
    for (const d of commonDates) {
      if (!returnMaps[i].map.has(d)) commonDates.delete(d);
    }
  }

  const sortedDates = [...commonDates].sort();

  if (sortedDates.length < 30) {
    console.warn(`[correlation] Only ${sortedDates.length} aligned trading days — insufficient for stable correlation (need ≥30)`);
    return null;
  }

  const tickers = pricesByTicker.map(p => p.ticker);
  const n = tickers.length;

  // Aligned return series per ticker
  const series = returnMaps.map(({ map }) => sortedDates.map(d => map.get(d)));

  // Build N×N matrix
  const matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 1.0;
      return pearson(series[i], series[j]);
    })
  );

  return {
    tickers,
    matrix,
    alignedDateRange: {
      start: sortedDates[0],
      end:   sortedDates[sortedDates.length - 1],
      count: sortedDates.length,
    },
  };
}

/**
 * Pearson correlation coefficient between two equal-length numeric arrays.
 * r = Σ((x_i - x̄)(y_i - ȳ)) / sqrt(Σ(x_i - x̄)² · Σ(y_i - ȳ)²)
 *
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {number} — in range [-1, 1]; 0 if degenerate
 */
function pearson(xs, ys) {
  const n = xs.length;
  if (n === 0) return 0;

  let xSum = 0, ySum = 0;
  for (let i = 0; i < n; i++) { xSum += xs[i]; ySum += ys[i]; }
  const xMean = xSum / n;
  const yMean = ySum / n;

  let num = 0, xSq = 0, ySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    xSq  += dx * dx;
    ySq  += dy * dy;
  }

  const denom = Math.sqrt(xSq * ySq);
  return denom === 0 ? 0 : num / denom;
}
