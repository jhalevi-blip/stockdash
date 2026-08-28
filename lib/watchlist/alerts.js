// Pure decision for a single candidate row's target-cross alert (spec §8).
//
// `active` is the ledger's armed flag from price_alerts:
//   • true / absent (undefined|null) → armed (eligible to fire)
//   • false                          → already fired, awaiting re-arm
//
// @returns {'fire'|'rearm'|'quiet'}
//   fire   — price is at/below target and the alert is armed → email + disarm
//   rearm  — price recovered above target while disarmed → re-arm for next cross
//   quiet  — nothing to do (armed & above target, or disarmed & still below → the
//            dedup case that stops a fired alert re-emailing every 15 min)
export function decideAlert({ price, target, active }) {
  const armed = active === undefined || active === null ? true : active === true;
  if (price <= target) return armed ? 'fire' : 'quiet';
  return armed ? 'quiet' : 'rearm';
}
