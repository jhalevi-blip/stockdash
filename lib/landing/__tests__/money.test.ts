/**
 * money() formatting unit tests — the landing result view's native-currency
 * cost-basis formatter.
 *
 * Test runner: Vitest. `npm test` (vitest run) or `npx vitest`.
 */
import { describe, it, expect } from 'vitest';
import { money } from '../money';

describe('money()', () => {
  it('renders the established EUR/USD/GBP symbols', () => {
    expect(money(1000, 'EUR')).toBe('€1,000');
    expect(money(5400, 'USD')).toBe('$5,400');
    expect(money(1000, 'GBP')).toBe('£1,000');
  });

  it('renders GBp/GBX as pence, not pounds', () => {
    // 0-decimal rounding would turn 108p into "£1" if converted — keep it as pence.
    expect(money(108, 'GBp')).toBe('108p');
    expect(money(108, 'GBX')).toBe('108p');
    expect(money(2900, 'GBX')).toBe('2,900p');
    expect(money(290000, 'GBX')).toBe('290,000p');
  });

  it('prefixes CAD with C$ and JPY with ¥', () => {
    expect(money(1000, 'CAD')).toBe('C$1,000');
    expect(money(1000, 'JPY')).toBe('¥1,000');
  });

  it('falls back to a trailing currency code for unknown currencies', () => {
    expect(money(1000, 'CHF')).toBe('1,000 CHF');
  });

  it('rounds to whole units and treats a null amount as 0', () => {
    expect(money(108.7, 'USD')).toBe('$109');
    expect(money(null, 'USD')).toBe('$0');
    expect(money(undefined, 'USD')).toBe('$0');
  });
});
