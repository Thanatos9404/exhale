import { aqiCategory, aqiSeries, type AqiResult } from '../air/aqi.js';
import type { AqiStandard, HourPoint } from '../air/types.js';
import {
  dispersionClass,
  ventilationCoefficient,
  type LidSpan,
  type Window as PmWindow,
} from '../science/meteo.js';
import { hourSpan, round } from './format.js';
import type { PlanResult } from './types.js';

/** The plan's description of the air: current risk and readings, notable windows, headline. */

/** Used when the series has no AQI for the current hour. */
const NO_READING: Pick<AqiResult, 'aqi' | 'dominant'> = { aqi: 0, dominant: 'pm25' };

/** AQI for the current hour (trailing averages, as the standard prescribes) and its category. */
export function riskNow(
  hourly: readonly HourPoint[],
  nowIndex: number,
  standard: AqiStandard,
): PlanResult['risk'] {
  const now = aqiSeries(hourly, standard)[nowIndex] ?? NO_READING;
  const category = aqiCategory(now.aqi, standard);
  return {
    aqi: now.aqi,
    level: category.level,
    label: category.label,
    advice: category.advice,
    dominant: now.dominant,
    standard,
  };
}

/** Readings for the current hour, with the ventilation coefficient rounded to whole m²/s. */
export function currentConditions(now: HourPoint | undefined): PlanResult['current'] {
  const vc = ventilationCoefficient(now?.blh ?? null, now?.wind ?? null);
  return {
    pm25: now?.pm25 ?? null,
    blh: now?.blh ?? null,
    wind: now?.wind ?? null,
    ventilationCoefficient: vc === null ? null : round(vc),
    dispersion: dispersionClass(vc),
  };
}

/** A clean or dirty window as "HH:00" labels and a rounded mean PM2.5. */
export function windowSummary(
  hourly: readonly HourPoint[],
  window: PmWindow | null,
): PlanResult['cleanWindow'] {
  if (!window) return null;
  return { ...hourSpan(hourly, window.start, window.end), pm25: round(window.meanPm25) };
}

/** Lid spans as "HH:00" labels with their lowest mixing height, plus the total lid hours. */
export function lidSummary(
  hourly: readonly HourPoint[],
  lids: readonly LidSpan[],
): PlanResult['lid'] {
  return {
    spans: lids.map((l) => ({ ...hourSpan(hourly, l.start, l.end), minBlh: round(l.minBlh) })),
    stagnantHours: lids.reduce((sum, l) => sum + (l.end - l.start), 0),
  };
}

/**
 * One-line story of the day: the first smog lid if there is one, otherwise the AQI, then the
 * cleanest hour and how much the plan cuts the household's dose.
 */
export function headlineFor(
  lid: PlanResult['lid'],
  clean: PlanResult['cleanWindow'],
  risk: PlanResult['risk'],
  exposureCutPct: number,
): string {
  const [firstLid] = lid.spans;
  const opening = firstLid
    ? `Smog lid ${firstLid.start} to ${firstLid.end}: air can only mix ${firstLid.minBlh} m high.`
    : `Air is ${risk.label.toLowerCase()} (AQI ${risk.aqi}).`;
  const cleanest = clean ? ` Cleanest hour is ${clean.start}.` : '';
  return `${opening}${cleanest} Today's plan cuts your household's dose by ${Math.round(exposureCutPct)}%.`;
}
