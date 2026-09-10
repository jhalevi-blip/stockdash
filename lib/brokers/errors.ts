/**
 * Thrown by a broker parser when a file that detected as that broker is missing a
 * column the parser structurally needs (a renamed, removed, or localised header).
 *
 * Callers surface this as "columns not recognised" instead of letting the parser
 * fall through to zero trades or a fabricated €0 cash balance — the silent-empty
 * result is exactly the failure mode we want to make loud.
 */
export class UnrecognizedColumnsError extends Error {
  broker: string;
  missing: string[];
  constructor(broker: string, missing: string[]) {
    super(`Unrecognized ${broker} export — missing required column(s): ${missing.join(', ')}`);
    this.name = 'UnrecognizedColumnsError';
    this.broker = broker;
    this.missing = missing;
  }
}
