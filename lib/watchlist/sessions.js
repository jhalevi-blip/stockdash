// Per-group market sessions for the quotes route + poll gating (spec §4).
//
// Step 2 only ever quotes US-listed equities (non-US names resolve to their US
// listing) and FX pairs, so only two sessions matter here:
//   • equity → the US regular session (reuses lib/marketStatus, which carries the
//     NYSE holiday calendar)
//   • fx     → continuous, Sun 22:00 → Fri 22:00 (Europe/Berlin, DST-aware)
//
// TODO (spec §4): swap these for FMP's market-hours + holidays-by-exchange
// endpoints once the chart/fundamentals work lands — they handle exchange holidays
// this local approximation does not. Hardcoding is called out as a stopgap here.

import { getMarketStatus } from '../marketStatus.js';

export function getUsEquitySession(date = new Date()) {
  const { isOpen } = getMarketStatus(date);
  return { isOpen, label: isOpen ? 'US open' : 'US closed' };
}

export function getFxSession(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const p = {};
  for (const { type, value } of parts) p[type] = value;
  const minutes = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
  const CLOSE = 22 * 60; // 22:00 Berlin

  let isOpen = true;
  if (p.weekday === 'Sat') isOpen = false;
  else if (p.weekday === 'Sun') isOpen = minutes >= CLOSE; // opens Sun 22:00
  else if (p.weekday === 'Fri') isOpen = minutes < CLOSE;  // closes Fri 22:00

  return { isOpen, label: isOpen ? 'FX open' : 'FX closed' };
}

export function getSessions(date = new Date()) {
  return {
    equity: getUsEquitySession(date),
    fx: getFxSession(date),
  };
}
