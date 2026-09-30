/**
 * Saxo G.2 parser unit tests
 *
 * Test runner: Vitest (not yet installed — run `npm i -D vitest` then add
 * `"test": "vitest"` to package.json scripts before executing these).
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSaxo } from '../saxo';

const HEADERS         = ['Type', 'Transactiedatum', 'Instrumentsymbool', 'Acties'];
const HEADERS_VALUTA  = ['Type', 'Transactiedatum', 'Instrumentsymbool', 'Acties', 'Instrumentvaluta'];
// Boekingsbedrag is the account-currency (EUR) signed booking amount. Non-trade rows
// (dividends, deposits) carry their cash impact here — the parser routes it to the
// income / deposit / cash-event totals, so a test asserting that needs the column.
const HEADERS_BOEKING = ['Type', 'Transactiedatum', 'Instrumentsymbool', 'Acties', 'Boekingsbedrag'];

function makeWorkbook(dataRows: unknown[][], headers = HEADERS): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  return { SheetNames: ['Transacties'], Sheets: { Transacties: sheet } };
}

describe('parseSaxo — Acties parsing', () => {
  it('parses a standard buy (positive share count)', () => {
    const wb = makeWorkbook([
      ['Transactie', '01-01-2024', 'AMD:xnas', 'Koop 100 @ 150.00 USD'],
    ]);
    const { trades } = parseSaxo(wb);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      ticker: 'AMD',
      shares: 100,
      price: 150,
      action: 'buy',
      currency: 'USD',
    });
  });

  it('parses a standard sell — no minus sign (Verkoop 100 @ 490.00 USD)', () => {
    const wb = makeWorkbook([
      ['Transactie', '02-01-2024', 'AMD:xnas', 'Verkoop 100 @ 490.00 USD'],
    ]);
    const { trades } = parseSaxo(wb);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      ticker: 'AMD',
      shares: 100,
      price: 490,
      action: 'sell',
      currency: 'USD',
    });
  });

  it('parses a sell with negative share prefix — Verkoop -25 @ 168.01 USD', () => {
    // Regression: this format was previously passed through as shares=-25.
    // abs() must be applied so shares is always a positive magnitude;
    // direction is carried by action='sell'.
    const wb = makeWorkbook([
      ['Transactie', '03-01-2024', 'AMD:xnas', 'Verkoop -25 @ 168.01 USD'],
    ]);
    const { trades } = parseSaxo(wb);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      ticker: 'AMD',
      shares: 25,
      price: 168.01,
      action: 'sell',
      currency: 'USD',
    });
  });

  it('skips options rows (symbol contains /)', () => {
    const wb = makeWorkbook([
      ['Transactie', '01-01-2024', 'AMD/C150:xnas', 'Koop 1 @ 3.50 USD'],
    ]);
    const { trades, skipSummary } = parseSaxo(wb);
    expect(trades).toHaveLength(0);
    expect(skipSummary.optionsSkipped).toBe(1);
  });

  it('treats a Dividend corporate-action row as income, not a trade', () => {
    // A "Dividend" corporate action is dividend income (Boekingsbedrag credited),
    // NOT a trade and NOT an unparseable/skipped row: it must land in the dividends
    // total (and the raw cash track) and produce no trade.
    const wb = makeWorkbook(
      [['Corporate Action', '01-01-2024', 'AAPL:xnas', 'Dividend', 12.34]],
      HEADERS_BOEKING,
    );
    const { trades, dividends, cashEvents, skipSummary } = parseSaxo(wb);
    expect(trades).toHaveLength(0);
    expect(dividends).toEqual([{ date: '2024-01-01', amountEur: 12.34 }]);
    expect(cashEvents).toContainEqual({ date: '2024-01-01', amountEur: 12.34 });
    expect(skipSummary.dividendsSkipped).toBe(0);
  });

  it('treats a Storting (Geldoverboeking) row as a cash deposit, not a trade', () => {
    // "Storting" is an external cash deposit (Geldoverboeking), NOT a trade: it must
    // land in the deposits total (external cash flow) and the raw cash track, produce
    // no trade, and not be counted as a skipped cash transfer.
    const wb = makeWorkbook(
      [['Geldoverboeking', '01-01-2024', '', 'Storting', 1000]],
      HEADERS_BOEKING,
    );
    const { trades, deposits, cashEvents, skipSummary } = parseSaxo(wb);
    expect(trades).toHaveLength(0);
    expect(deposits).toEqual([{ date: '2024-01-01', amountEur: 1000 }]);
    expect(cashEvents).toContainEqual({ date: '2024-01-01', amountEur: 1000 });
    expect(skipSummary.cashTransfersSkipped).toBe(0);
  });

  it('strips exchange suffix from ticker (CELH:xnas → CELH)', () => {
    const wb = makeWorkbook([
      ['Transactie', '01-01-2024', 'CELH:xnas', 'Koop 50 @ 40.00 USD'],
    ]);
    const { trades } = parseSaxo(wb);
    expect(trades[0].ticker).toBe('CELH');
  });

  it('resolves currency from Instrumentvaluta when Acties has no trailing currency code', () => {
    // Regression: "Verkoop 100 @ 490.00" (no trailing CCY) was dropped by the old mandatory
    // currency capture group. Parser must fall back to the Instrumentvaluta column.
    const wb = makeWorkbook(
      [['Transactie', '02-01-2024', 'AMD:xnas', 'Verkoop 100 @ 490.00', 'USD']],
      HEADERS_VALUTA,
    );
    const { trades } = parseSaxo(wb);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      ticker: 'AMD',
      shares: 100,
      price: 490,
      action: 'sell',
      currency: 'USD',
    });
  });
});
