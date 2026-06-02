export interface StockSplit { date: string; ratio: number; } // ISO date; ratio = new shares per old

export const STOCK_SPLITS: Record<string, StockSplit[]> = {
  AVGO: [{ date: '2024-07-15', ratio: 10 }],
};
