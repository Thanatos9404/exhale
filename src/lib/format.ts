/**
 * Display formatting for numbers, doses and times. Numbers use Indian digit grouping. Forecast
 * times are handled as wall-clock strings, so no time zone conversion can shift an hour.
 */
/** Whole number with Indian digit grouping, e.g. 1,24,000. */
export const fmtInt = (v: number) => Math.round(v).toLocaleString('en-IN');

/** Fixed `dp` decimal places with Indian digit grouping. */
export const fmtDec = (v: number, dp = 1) =>
  v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Decimal places that keep a cigarette count to about two significant digits. */
function cigDecimals(magnitude: number): number {
  if (magnitude >= 10) return 0;
  if (magnitude >= 1) return 1;
  return 2;
}

/** "2.4" for big numbers, "0.35" for small ones, so cigarettes read naturally. */
export const fmtCig = (v: number) => fmtDec(v, cigDecimals(Math.abs(v)));

/** µg with a readable unit step: 1,240 µg or 1.2 mg. */
export const fmtDose = (ug: number) =>
  Math.abs(ug) >= 10_000 ? `${fmtDec(ug / 1000, 1)} mg` : `${fmtInt(ug)} µg`;

/** "HH:mm" from a wall-clock ISO time such as "2026-11-23T06:00". */
export const hourLabel = (time: string) => time.slice(11, 16);

/** "Mon 06:00" from a wall-clock ISO time; read as UTC so the local wall clock is kept. */
export const dayHourLabel = (time: string) => {
  const d = new Date(`${time}:00Z`);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return `${day} ${time.slice(11, 16)}`;
};

/** Compact age of a timestamp: "just now", "5m ago", "3h ago" or "2d ago". */
export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
