import type { HourPoint } from '../air/types.js';

/**
 * Winter smog meteorology.
 *
 * On calm winter nights the ground cools fast, a layer of warm air settles on top of colder
 * air, and the planetary boundary layer (the height pollution can mix into) collapses to tens
 * of metres. The ventilation coefficient (VC = boundary-layer height × wind speed) measures how
 * much room and wind the air has to dilute emissions. The India Meteorological Department treats
 * VC below about 6000 m²/s with weak wind as unfavourable for dispersion.
 */

export type Dispersion = 'stagnant' | 'poor' | 'moderate' | 'good';

/** m²/s. `blh` in metres, `windKmh` in km/h. */
export function ventilationCoefficient(blh: number | null, windKmh: number | null): number | null {
  if (blh == null || windKmh == null) return null;
  return Math.max(0, blh) * (Math.max(0, windKmh) / 3.6);
}

export function dispersionClass(vc: number | null): Dispersion | null {
  if (vc == null) return null;
  if (vc < 1000) return 'stagnant';
  if (vc < 3000) return 'poor';
  if (vc < 6000) return 'moderate';
  return 'good';
}

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

export const hourOf = (time: string): number => Number.parseInt(time.slice(11, 13), 10);

export const fmtHour = (h: number): string => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;

export interface Window {
  start: number;
  end: number;
  meanPm25: number;
}

/**
 * Cleanest run of `duration` consecutive hours in `hourly[from..to)` whose start hour-of-day
 * falls within [dayStart, dayEnd]. Returns null if nothing qualifies.
 */
export function cleanestWindow(
  hourly: readonly HourPoint[],
  from: number,
  to: number,
  duration = 1,
  dayStart = 0,
  dayEnd = 23,
): Window | null {
  let best: Window | null = null;
  const last = Math.min(hourly.length, to) - duration;
  for (let i = Math.max(0, from); i <= last; i++) {
    const h = hourOf(hourly[i]!.time);
    if (h < dayStart || h > dayEnd) continue;
    let sum = 0;
    let ok = true;
    for (let j = i; j < i + duration; j++) {
      const v = hourly[j]!.pm25;
      if (v == null) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) continue;
    const mean = sum / duration;
    if (!best || mean < best.meanPm25) best = { start: i, end: i + duration, meanPm25: mean };
  }
  return best;
}

/** Dirtiest run, same rules as `cleanestWindow`. */
export function dirtiestWindow(
  hourly: readonly HourPoint[],
  from: number,
  to: number,
  duration = 1,
): Window | null {
  let worst: Window | null = null;
  for (let i = Math.max(0, from); i <= Math.min(hourly.length, to) - duration; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i; j < i + duration; j++) {
      const v = hourly[j]!.pm25;
      if (v != null) {
        sum += v;
        n++;
      }
    }
    if (n === 0) continue;
    const mean = sum / n;
    if (!worst || mean > worst.meanPm25) worst = { start: i, end: i + duration, meanPm25: mean };
  }
  return worst;
}

export interface LidSpan {
  start: number;
  end: number;
  minBlh: number;
}

/** Contiguous runs of lid hours in `hourly[from..to)`. */
export function lidSpans(hourly: readonly HourPoint[], from: number, to: number): LidSpan[] {
  const spans: LidSpan[] = [];
  let cur: LidSpan | null = null;
  for (let i = Math.max(0, from); i < Math.min(hourly.length, to); i++) {
    const h = hourly[i]!;
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
