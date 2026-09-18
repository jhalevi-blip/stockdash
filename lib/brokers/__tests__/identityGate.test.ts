/**
 * Coverage + identity gate — unit tests for the pure pieces (name matching and
 * the exclusion decision). The FMP fetch helpers are network-bound and covered
 * by the route's integration behaviour, not here.
 *
 * Test runner: Vitest. `npm test` (vitest run).
 */
import { describe, it, expect } from 'vitest';
import { nameMatch, decideGate, brokerOrigin } from '../identityGate';
import type { BrokerFormat } from '../types';

describe('nameMatch', () => {
  it('matches across punctuation / suffix differences (OpenFIGI vs FMP)', () => {
    expect(nameMatch('BP PLC', 'BP p.l.c.')).toBe(true);
    expect(nameMatch('ASML Holding NV', 'ASML Holding N.V.')).toBe(true);
    expect(nameMatch('Apple Inc', 'Apple Inc.')).toBe(true);
  });

  it('rejects unrelated companies', () => {
    expect(nameMatch('Anheuser-Busch InBev', 'iShares MSCI Belgium ETF')).toBe(false);
    expect(nameMatch('Adyen', 'Adient plc')).toBe(false);
  });

  it('does not accept a substring collision shorter than 4 chars', () => {
    // After suffix stripping both reduce to short tokens that must not loosely match.
    expect(nameMatch('AB NV', 'AB Volvo')).toBe(false);
  });

  it('returns false when either name is empty', () => {
    expect(nameMatch('', 'Apple')).toBe(false);
    expect(nameMatch('Apple', '')).toBe(false);
  });
});

describe('brokerOrigin', () => {
  it('classifies brokers by ticker origin', () => {
    expect(brokerOrigin('degiro')).toBe('isin-named');
    expect(brokerOrigin('ibkr')).toBe('isin-unnamed');
    expect(brokerOrigin('rabobank')).toBe('isin-unnamed');
    expect(brokerOrigin('saxo')).toBe('broker-supplied');
    expect(brokerOrigin('trading212')).toBe('broker-supplied');
    expect(brokerOrigin('schwab')).toBe('broker-supplied');
    expect(brokerOrigin('generic')).toBe('broker-supplied');
  });
});

const pair = (broker: BrokerFormat, ticker: string) => ({ broker, ticker });

// Context factory — fills the fields a given test doesn't care about, so the
// coverageProbeFailed set defaults to empty (nothing failed transiently).
function ctx(over: Partial<Parameters<typeof decideGate>[1]> = {}): Parameters<typeof decideGate>[1] {
  return {
    covered: new Set(),
    coverageProbeFailed: new Set(),
    profiles: {},
    figiNameFor: () => undefined,
    ...over,
  };
}

describe('decideGate', () => {
  it('excludes any ticker with a confirmed-empty FMP series, on every broker', () => {
    const g = decideGate(
      [pair('degiro', 'ADYEN'), pair('saxo', 'ADYEN')],
      ctx({ figiNameFor: () => 'Adyen NV' }), // covered empty, no probe failure → confirmed empty
    );
    expect(g.excludedKeys.has('degiro__ADYEN')).toBe(true);
    expect(g.excludedKeys.has('saxo__ADYEN')).toBe(true);
    expect(g.exclusions.every((e) => e.reason === 'coverage')).toBe(true);
  });

  it('excludes an ISIN-resolved ticker whose OpenFIGI name disagrees with FMP', () => {
    const g = decideGate(
      [pair('degiro', 'ABI')],
      ctx({
        covered: new Set(['ABI']),
        profiles: { ABI: { name: 'iShares MSCI Belgium ETF' } },
        figiNameFor: () => 'Anheuser-Busch InBev',
      }),
    );
    expect(g.excludedKeys.has('degiro__ABI')).toBe(true);
    expect(g.exclusions[0]).toMatchObject({
      broker: 'degiro', ticker: 'ABI', reason: 'identity',
      figiName: 'Anheuser-Busch InBev', fmpName: 'iShares MSCI Belgium ETF',
    });
  });

  it('passes an ISIN-resolved ticker whose names match', () => {
    const g = decideGate(
      [pair('degiro', 'ASML')],
      ctx({
        covered: new Set(['ASML']),
        profiles: { ASML: { name: 'ASML Holding N.V.' } },
        figiNameFor: () => 'ASML HOLDING NV',
      }),
    );
    expect(g.excludedKeys.size).toBe(0);
    expect(g.exclusions).toHaveLength(0);
  });

  it('does NOT exclude when the FMP profile name is missing — reports it as unverified', () => {
    const g = decideGate(
      [pair('degiro', 'XYZ')],
      ctx({ covered: new Set(['XYZ']), profiles: {}, figiNameFor: () => 'Some Issuer NV' }),
    );
    // Absence of an FMP answer is not evidence of a wrong mapping — pass, don't drop.
    expect(g.excludedKeys.size).toBe(0);
    expect(g.exclusions).toHaveLength(0);
    expect(g.identityUnverified).toEqual([
      { broker: 'degiro', ticker: 'XYZ', reason: 'fmp-profile-unavailable' },
    ]);
  });

  it('does NOT exclude a DeGiro ticker with no OpenFIGI name — reports no-openfigi-name', () => {
    const g = decideGate(
      [pair('degiro', 'XYZ')],
      ctx({ covered: new Set(['XYZ']), profiles: { XYZ: { name: 'Some Issuer NV' } }, figiNameFor: () => undefined }),
    );
    expect(g.excludedKeys.size).toBe(0);
    expect(g.identityUnverified).toEqual([
      { broker: 'degiro', ticker: 'XYZ', reason: 'no-openfigi-name' },
    ]);
  });

  it('does NOT exclude on a transient coverage-probe failure — reports coverageUnverified', () => {
    const g = decideGate(
      [pair('degiro', 'AMD'), pair('saxo', 'AMD')],
      ctx({ covered: new Set(), coverageProbeFailed: new Set(['AMD']), figiNameFor: () => 'Advanced Micro Devices' }),
    );
    // Probe threw / HTTP-errored — not a confirmed-empty series, so pass both lots.
    expect(g.excludedKeys.size).toBe(0);
    expect(g.exclusions).toHaveLength(0);
    expect(g.coverageUnverified).toEqual([
      { broker: 'degiro', ticker: 'AMD' },
      { broker: 'saxo', ticker: 'AMD' },
    ]);
    // Coverage was unresolved, so identity is skipped for it — not double-reported.
    expect(g.identityUnverified).toHaveLength(0);
  });

  it('passes broker-supplied tickers without running identity', () => {
    const g = decideGate(
      [pair('saxo', 'AMD'), pair('trading212', 'TSLA')],
      ctx({ covered: new Set(['AMD', 'TSLA']) }),
    );
    expect(g.excludedKeys.size).toBe(0);
    expect(g.identityUnverified).toHaveLength(0);
  });

  it('reports IBKR/Rabobank as identity-unverified rather than excluding or passing silently', () => {
    const g = decideGate(
      [pair('ibkr', 'AAPL'), pair('rabobank', 'ASML')],
      ctx({ covered: new Set(['AAPL', 'ASML']) }),
    );
    expect(g.excludedKeys.size).toBe(0);
    expect(g.identityUnverified).toEqual([
      { broker: 'ibkr', ticker: 'AAPL', reason: 'broker-has-no-name' },
      { broker: 'rabobank', ticker: 'ASML', reason: 'broker-has-no-name' },
    ]);
  });

  it('lets a symbol fail at DeGiro yet pass at a broker that supplied it', () => {
    const g = decideGate(
      [pair('degiro', 'ABI'), pair('saxo', 'ABI')],
      ctx({
        covered: new Set(['ABI']),
        profiles: { ABI: { name: 'iShares MSCI Belgium ETF' } },
        figiNameFor: (broker) => (broker === 'degiro' ? 'Anheuser-Busch InBev' : undefined),
      }),
    );
    expect(g.excludedKeys.has('degiro__ABI')).toBe(true);
    expect(g.excludedKeys.has('saxo__ABI')).toBe(false);
  });
});
