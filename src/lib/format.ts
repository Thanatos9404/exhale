export const fmtInt = (v: number) => Math.round(v).toLocaleString('en-IN');

export const fmtDec = (v: number, dp = 1) =>
  v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** "2.4" for big numbers, "0.35" for small ones, so cigarettes read naturally. */
export const fmtCig = (v: number) =>
  Math.abs(v) >= 10 ? fmtDec(v, 0) : Math.abs(v) >= 1 ? fmtDec(v, 1) : fmtDec(v, 2);

/** µg with a readable unit step: 1,240 µg or 1.2 mg. */
export const fmtDose = (ug: number) =>
  Math.abs(ug) >= 10_000 ? `${fmtDec(ug / 1000, 1)} mg` : `${fmtInt(ug)} µg`;

export const hourLabel = (time: string) => time.slice(11, 16);

export const dayHourLabel = (time: string) => {
  const d = new Date(`${time}:00Z`);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return `${day} ${time.slice(11, 16)}`;
};

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
