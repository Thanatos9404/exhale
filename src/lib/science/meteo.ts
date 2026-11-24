/**
 * Winter smog meteorology. On calm winter nights warm air settles over colder air and the
 * boundary layer (the height pollution can mix into) collapses to tens of metres. The ventilation
 * coefficient (boundary-layer height × wind speed) measures how much room and wind the air has to
 * dilute emissions; India's Meteorological Department treats below about 6000 m²/s as unfavourable.
 */
import type { HourPoint } from '../air/types.js';

/** How well the air can dilute emissions, from the ventilation coefficient. */
export type Dispersion = 'stagnant' | 'poor' | 'moderate' | 'good';

/** Ventilation coefficient in m²/s. `blh` in metres, `windKmh` in km/h. */
export function ventilationCoefficient(blh: number | null, windKmh: number | null): number | null {
  if (blh == null || windKmh == null) return null;
  return Math.max(0, blh) * (Math.max(0, windKmh) / 3.6);
}

/** Dispersion class for a ventilation coefficient in m²/s. Below 6000 is unfavourable (IMD). */
export function dispersionClass(vc: number | null): Dispersion | null {
  if (vc == null) return null;
  if (vc < 1000) return 'stagnant';
  if (vc < 3000) return 'poor';
  if (vc < 6000) return 'moderate';
  return 'good';
}

/** Display names for each dispersion class. */
export const DISPERSION_LABEL: Record<Dispersion, string> = {
  stagnant: 'Stagnant lid',
  poor: 'Poor dispersion',
  moderate: 'Moderate dispersion',
  good: 'Good dispersion',
};

/** A "lid" hour: shallow mixing layer and light wind, so emissions pile up near the ground. */
export function isLidHour(h: Pick<HourPoint, 'blh' | 'wind'>): boolean {
  return h.blh != null && h.blh < 300 && (h.wind ?? 0) < 12;
}

/** Local hour of day (0 to 23) of a wall-clock ISO time such as "2026-11-23T06:00". */
export const hourOf = (time: string): number => Number.parseInt(time.slice(11, 13), 10);

/** "HH:00" for an hour of day, wrapping values outside 0 to 23 (25 reads "01:00"). */
export const fmtHour = (h: number): string => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;

/** A run of consecutive hours `hourly[start..end)` and its mean PM2.5, µg/m³. */
export interface Window {
  start: number;
  end: number;
  meanPm25: number;
}

/** Each index in `hourly[from..to)` where a run of `duration` hours still fits, with its hour. */
function runStarts(
  hourly: readonly HourPoint[],
  from: number,
  to: number,
  duration: number,
): { start: number; point: HourPoint }[] {
  const first = Math.max(0, from);
  const last = Math.min(hourly.length, to) - duration;
  return hourly
    .slice(first, Math.max(first, last + 1))
    .map((point, offset) => ({ start: first + offset, point }));
}

/** Mean PM2.5 of a run, or null if any hour in it has no reading. */
function completeMean(run: readonly HourPoint[]): number | null {
  let sum = 0;
  for (const { pm25 } of run) {
    if (pm25 == null) return null;
    sum += pm25;
  }
  return sum / run.length;
}

/** Mean PM2.5 of the hours in a run that have a reading, or null if none do. */
function availableMean(run: readonly HourPoint[]): number | null {
  let sum = 0;
  let n = 0;
  for (const { pm25 } of run) {
    if (pm25 == null) continue;
    sum += pm25;
    n++;
  }
  return n === 0 ? null : sum / n;
}

/** Which runs `cleanestWindow` may pick. */
export interface CleanestWindowOptions {
  /** Length of the run in hours. Default 1. */
  duration?: number;
  /** Earliest local hour of day the run may start. Default 0. */
  dayStart?: number;
  /** Latest local hour of day the run may start. Default 23. */
  dayEnd?: number;
}

/**
 * Cleanest run of `duration` consecutive hours in `hourly[from..to)` whose start hour-of-day
 * falls within [dayStart, dayEnd]. Runs with a missing reading are skipped. Returns null if
 * nothing qualifies; the earliest run wins a tie.
 */
export function cleanestWindow(
  hourly: readonly HourPoint[],
  from: number,
  to: number,
  options: CleanestWindowOptions = {},
): Window | null {
  const { duration = 1, dayStart = 0, dayEnd = 23 } = options;
  let best: Window | null = null;
  for (const { start, point } of runStarts(hourly, from, to, duration)) {
    const hod = hourOf(point.time);
    if (hod < dayStart || hod > dayEnd) continue;
    const mean = completeMean(hourly.slice(start, start + duration));
    if (mean === null) continue;
    if (!best || mean < best.meanPm25) best = { start, end: start + duration, meanPm25: mean };
  }
  return best;
}

/**
 * Dirtiest run of `duration` consecutive hours in `hourly[from..to)`, at any time of day.
 * Missing readings are left out of the mean; runs with no readings at all are skipped.
 */
export function dirtiestWindow(
  hourly: readonly HourPoint[],
  from: number,
  to: number,
  duration = 1,
): Window | null {
  let worst: Window | null = null;
  for (const { start } of runStarts(hourly, from, to, duration)) {
    const mean = availableMean(hourly.slice(start, start + duration));
    if (mean === null) continue;
    if (!worst || mean > worst.meanPm25) worst = { start, end: start + duration, meanPm25: mean };
  }
  return worst;
}

/** A run of lid hours `hourly[start..end)` and the lowest boundary-layer height in it, metres. */
export interface LidSpan {
  start: number;
  end: number;
  minBlh: number;
}

/** Contiguous runs of lid hours in `hourly[from..to)`. */
export function lidSpans(hourly: readonly HourPoint[], from: number, to: number): LidSpan[] {
  const spans: LidSpan[] = [];
  let cur: LidSpan | null = null;
  const first = Math.max(0, from);
  for (const [offset, h] of hourly.slice(first, Math.max(first, to)).entries()) {
    const i = first + offset;
    if (isLidHour(h)) {
      if (!cur) cur = { start: i, end: i + 1, minBlh: h.blh ?? 0 };
      else {
        cur.end = i + 1;
        cur.minBlh = Math.min(cur.minBlh, h.blh ?? cur.minBlh);
      }
    } else if (cur) {
      spans.push(cur);
      cur = null;
    }
  }
  if (cur) spans.push(cur);
  return spans;
}
