const UTC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Format a Date as UTC yyyy-MM-dd. */
export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Default digest target: previous UTC calendar day. */
export function defaultDigestDateUtc(now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return formatUtcDate(d);
}

/** Inclusive start and exclusive end for a UTC calendar day. */
export function utcDayRange(dateUtc: string): { start: Date; end: Date } {
  if (!UTC_DATE_RE.test(dateUtc)) throw new Error("invalid_utc_date");
  const start = new Date(`${dateUtc}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
