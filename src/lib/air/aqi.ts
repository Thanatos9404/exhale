/**
 * Air Quality Index maths for two standards: US EPA AQI (PM2.5 breakpoints revised Feb 2024) and
 * India National AQI (CPCB, 2014). Each sub-index is a piecewise-linear interpolation and the
 * overall AQI is the worst sub-index. This is the public entry point for everything AQI: the
 * tables in ./aqiTables and the categories in ./aqiCategories are re-exported here.
 */
import { IN_TABLES, UG_PER_PPB, US_TABLES, type Band } from './aqiTables.js';
import type { AqiStandard, HourPoint, Pollutant } from './types.js';

export { aqiCategory, type AqiCategory, type AqiLevel } from './aqiCategories.js';
export { IN_TABLES, UG_PER_PPB, US_TABLES, type Band } from './aqiTables.js';

/** Piecewise-linear sub-index. Values between bands snap to the next band's lower edge. */
export function subIndex(concentration: number, table: readonly Band[]): number {
  if (!Number.isFinite(concentration) || concentration < 0) return 0;
  for (const b of table) {
    if (concentration <= b.chi) {
      const c = Math.max(concentration, b.clo);
      return Math.round(((b.ihi - b.ilo) / (b.chi - b.clo)) * (c - b.clo) + b.ilo);
    }
  }
  // Beyond the last breakpoint: the scale tops out.
  return table.at(-1)?.ihi ?? 0;
}

/** Averaged concentrations to score, already over each standard's averaging period. */
export interface PollutantAverages {
  /** 24 h mean, µg/m³. */
  pm25?: number | null;
  /** 24 h mean, µg/m³. */
  pm10?: number | null;
  /** 1 h value (US) or 24 h mean (India), µg/m³. */
  no2?: number | null;
  /** 8 h mean, µg/m³. */
  o3?: number | null;
}

/** Overall AQI, the pollutant that set it, and every sub-index that could be scored. */
export interface AqiResult {
  aqi: number;
  dominant: Pollutant;
  subIndices: Partial<Record<Pollutant, number>>;
}

/** AQI from averaged concentrations: the worst sub-index wins; missing values are skipped. */
export function computeAqi(avg: PollutantAverages, standard: AqiStandard): AqiResult {
  const tables = standard === 'us' ? US_TABLES : IN_TABLES;
  const toUnits = (p: Pollutant, v: number) => {
    if (standard === 'us' && (p === 'no2' || p === 'o3')) return v / UG_PER_PPB[p];
    // US PM2.5 is truncated to 0.1, PM10 to integers before lookup.
    if (standard === 'us' && p === 'pm25') return Math.floor(v * 10) / 10;
    if (standard === 'us' && p === 'pm10') return Math.floor(v);
    return v;
  };
  const subIndices: Partial<Record<Pollutant, number>> = {};
  let aqi = 0;
  let dominant: Pollutant = 'pm25';
  for (const p of ['pm25', 'pm10', 'no2', 'o3'] as const) {
    const raw = avg[p];
    if (raw == null || !Number.isFinite(raw)) continue;
    const idx = subIndex(toUnits(p, raw), tables[p]);
    subIndices[p] = idx;
    if (idx > aqi) {
      aqi = idx;
      dominant = p;
    }
  }
  return { aqi, dominant, subIndices };
}

/** Mean of the finite values in `values[from..to]` (inclusive bounds clamped to the array). */
export function windowMean(
  values: readonly (number | null)[],
  from: number,
  to: number,
): number | null {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, from); i <= Math.min(values.length - 1, to); i++) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/**
 * AQI for every hour using the averaging periods each standard prescribes
 * (trailing 24 h for PM, 8 h for O3, 1 h or 24 h for NO2).
 */
export function aqiSeries(hourly: readonly HourPoint[], standard: AqiStandard): AqiResult[] {
  const pm25 = hourly.map((h) => h.pm25);
  const pm10 = hourly.map((h) => h.pm10);
  const no2 = hourly.map((h) => h.no2);
  const o3 = hourly.map((h) => h.o3);
  return hourly.map((_, i) =>
    computeAqi(
      {
        pm25: windowMean(pm25, i - 23, i),
        pm10: windowMean(pm10, i - 23, i),
        no2: standard === 'us' ? no2[i] : windowMean(no2, i - 23, i),
        o3: windowMean(o3, i - 7, i),
      },
      standard,
    ),
  );
}

/**
 * Instant AQI from a single hour's concentrations. Used for "what is the air like at 07:00",
 * where a trailing average would blur the hour-to-hour swings people can act on.
 */
export function hourlyAqi(
  h: Pick<HourPoint, 'pm25' | 'pm10' | 'no2' | 'o3'>,
  standard: AqiStandard,
): AqiResult {
  return computeAqi({ pm25: h.pm25, pm10: h.pm10, no2: h.no2, o3: h.o3 }, standard);
}

/** Display names with proper chemical subscripts. */
export const POLLUTANT_LABEL: Record<Pollutant, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO₂',
  o3: 'O₃',
};
