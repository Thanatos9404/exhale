import type { HourPoint } from '../air/types.js';
import { defined } from '../assert.js';
import { fmtHour, hourOf } from '../science/meteo.js';

/** Formatting shared by every part of the plan, so a value reads the same everywhere. */

/** Rounds to `dp` decimal places. Every number in a plan passes through here. */
export function round(value: number, dp = 0): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/** A PM2.5 concentration as it appears in titles and details, e.g. "142 µg/m³". */
export const fmtPm = (pm25: number): string => `${Math.round(pm25)} µg/m³`;

/** Local hour of day (0 to 23) of `hourly[index]`; callers pass indices inside the series. */
export function hourAt(hourly: readonly HourPoint[], index: number): number {
  return hourOf(defined(hourly[index], `hourly[${index}]`).time);
}

/**
 * "HH:00" labels for the hours `hourly[start..end)`. The end label is the hour the last
 * slot closes, so a single slot at 13:00 reads "13:00 to 14:00".
 */
export function hourSpan(
  hourly: readonly HourPoint[],
  start: number,
  end: number,
): { start: string; end: string } {
  return {
    start: fmtHour(hourAt(hourly, start)),
    end: fmtHour(hourAt(hourly, Math.max(start, end - 1)) + 1),
  };
}
