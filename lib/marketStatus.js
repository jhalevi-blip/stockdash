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

// Break an instant into ET calendar/clock fields via Intl — no tz library. The
// single place the timezone conversion happens; every export below builds on it.
function etFields(date) {
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

  return {
    isoDate: `${p.year}-${p.month}-${p.day}`,       // ET calendar date, 'YYYY-MM-DD'
    weekday: p.weekday,                             // 'Mon'..'Sun'
    minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10),
  };
}

// A full NYSE trading day (weekday, not a full-day holiday). Half-days ARE trading days.
function isTradingDay(isoDate, weekday) {
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  return !isWeekend && !FULL_HOLIDAYS.includes(isoDate);
}

/** The ET calendar date ('YYYY-MM-DD') of an instant. */
export function etCalendarDate(date = new Date()) {
  return etFields(date).isoDate;
}

/**
 * @param {Date} [date] — instant to evaluate; defaults to now.
 * @returns {{ isOpen: boolean, label: string }}
 */
export function getMarketStatus(date = new Date()) {
  const { isoDate, weekday, minutes } = etFields(date);
  const close = HALF_DAYS.includes(isoDate) ? CLOSE_HALFDAY : CLOSE_REGULAR;

  const isOpen =
    isTradingDay(isoDate, weekday) &&
    minutes >= OPEN_MINUTES &&
    minutes < close;

  return { isOpen, label: isOpen ? 'Market open' : 'Market closed' };
}

/**
 * The ET calendar date ('YYYY-MM-DD') of the most recent NYSE session whose close
 * has already passed as of `date`. Today counts only once its close (16:00 ET, or
 * 13:00 ET on a half-day) has passed; otherwise it steps back to the previous
 * trading day, skipping weekends and holidays.
 *
 * Used to judge quote freshness in a way that never false-alarms on a weekend,
 * holiday, or pre-open morning: a last-close quote is fresh iff its own ET date is
 * on or after this date.
 *
 * @param {Date} [date] — instant to evaluate; defaults to now.
 * @returns {string} ET date 'YYYY-MM-DD'.
 */
export function lastCompletedSessionDate(date = new Date()) {
  let cur = new Date(date);
  // At most ~10 steps back covers the longest weekend + holiday run comfortably.
  for (let i = 0; i < 10; i++) {
    const { isoDate, weekday, minutes } = etFields(cur);
    if (isTradingDay(isoDate, weekday)) {
      const close = HALF_DAYS.includes(isoDate) ? CLOSE_HALFDAY : CLOSE_REGULAR;
      // On the starting day, require the close to have passed; earlier days always count.
      if (i > 0 || minutes >= close) return isoDate;
    }
    cur = new Date(cur.getTime() - 24 * 60 * 60 * 1000); // step back ~1 day (ET date decrements)
  }
  return etFields(cur).isoDate; // unreachable in practice; safe fallback
}
