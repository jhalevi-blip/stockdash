// NYSE regular-hours market status, computed purely from a Date with no tz library.
// Regular session: Mon–Fri, 09:30–16:00 ET, excluding holidays. Early-close
// half-days end at 13:00 ET.
//
// ⚠️ ANNUAL UPDATE REQUIRED: the holiday arrays below only cover the years listed.
// Each December, add the next year's NYSE calendar — one line per date. Dates are
// the exchange's local (ET) calendar date in 'YYYY-MM-DD' form.

// Full-day closures.
const FULL_HOLIDAYS = [
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Washington's Birthday
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving Day
  '2026-12-25', // Christmas Day
];

// Early closes — regular session ends at 13:00 ET instead of 16:00.
const HALF_DAYS = [
  // 2026
  '2026-11-27', // Day after Thanksgiving
  '2026-12-24', // Christmas Eve
];

const OPEN_MINUTES  = 9 * 60 + 30; // 09:30 ET
const CLOSE_REGULAR = 16 * 60;     // 16:00 ET
const CLOSE_HALFDAY = 13 * 60;     // 13:00 ET

/**
 * @param {Date} [date] — instant to evaluate; defaults to now.
 * @returns {{ isOpen: boolean, label: string }}
 */
export function getMarketStatus(date = new Date()) {
  // Break the instant into ET calendar/clock fields via Intl — no tz library.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // 00–23, avoids en-US's midnight-as-'24' quirk
  }).formatToParts(date);

  const p = {};
  for (const { type, value } of parts) p[type] = value;

  const isoDate = `${p.year}-${p.month}-${p.day}`;
  const minutes = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);

  const isWeekend    = p.weekday === 'Sat' || p.weekday === 'Sun';
  const isFullHoliday = FULL_HOLIDAYS.includes(isoDate);
  const close = HALF_DAYS.includes(isoDate) ? CLOSE_HALFDAY : CLOSE_REGULAR;

  const isOpen =
    !isWeekend &&
    !isFullHoliday &&
    minutes >= OPEN_MINUTES &&
    minutes < close;

  return { isOpen, label: isOpen ? 'Market open' : 'Market closed' };
}
