import { defined } from '../assert.js';
import type { AqiStandard, HourPoint, Pollutant } from './types.js';

/**
 * Air Quality Index maths for two standards:
 *  - US EPA AQI (PM2.5 breakpoints revised Feb 2024)
 *  - India National AQI (CPCB, 2014)
 * Each sub-index is a piecewise-linear interpolation; the overall AQI is the worst sub-index.
 */

/** One breakpoint row: concentrations [clo, chi] map linearly onto index values [ilo, ihi]. */
interface Band {
  /** Concentration range (µg/m³ unless noted). */
  clo: number;
  chi: number;
  /** Index range. */
  ilo: number;
  ihi: number;
}

const band = (clo: number, chi: number, ilo: number, ihi: number): Band => ({ clo, chi, ilo, ihi });

/** US EPA tables. PM in µg/m³ (24 h), NO2 in ppb (1 h), O3 in ppb (8 h). */
export const US_TABLES: Record<Pollutant, Band[]> = {
  pm25: [
    band(0, 9.0, 0, 50),
    band(9.1, 35.4, 51, 100),
    band(35.5, 55.4, 101, 150),
    band(55.5, 125.4, 151, 200),
    band(125.5, 225.4, 201, 300),
    band(225.5, 325.4, 301, 500),
  ],
  pm10: [
    band(0, 54, 0, 50),
    band(55, 154, 51, 100),
    band(155, 254, 101, 150),
    band(255, 354, 151, 200),
    band(355, 424, 201, 300),
    band(425, 604, 301, 500),
  ],
  no2: [
    band(0, 53, 0, 50),
    band(54, 100, 51, 100),
    band(101, 360, 101, 150),
    band(361, 649, 151, 200),
    band(650, 1249, 201, 300),
    band(1250, 2049, 301, 500),
  ],
  o3: [
    band(0, 54, 0, 50),
    band(55, 70, 51, 100),
    band(71, 85, 101, 150),
    band(86, 105, 151, 200),
    band(106, 200, 201, 300),
  ],
};

/** India NAQI tables, all µg/m³. PM and NO2 on 24 h means, O3 on 8 h means. */
export const IN_TABLES: Record<Pollutant, Band[]> = {
  pm25: [
    band(0, 30, 0, 50),
    band(31, 60, 51, 100),
    band(61, 90, 101, 200),
    band(91, 120, 201, 300),
    band(121, 250, 301, 400),
    band(251, 380, 401, 500),
  ],
  pm10: [
    band(0, 50, 0, 50),
    band(51, 100, 51, 100),
    band(101, 250, 101, 200),
    band(251, 350, 201, 300),
    band(351, 430, 301, 400),
    band(431, 600, 401, 500),
  ],
  no2: [
    band(0, 40, 0, 50),
    band(41, 80, 51, 100),
    band(81, 180, 101, 200),
    band(181, 280, 201, 300),
    band(281, 400, 301, 400),
    band(401, 800, 401, 500),
  ],
  o3: [
    band(0, 50, 0, 50),
    band(51, 100, 51, 100),
    band(101, 168, 101, 200),
    band(169, 208, 201, 300),
    band(209, 748, 301, 400),
    band(749, 1000, 401, 500),
  ],
};

/** µg/m³ per ppb at 25 °C and 1 atm. */
export const UG_PER_PPB = { no2: 1.88, o3: 1.96 } as const;

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

/** Category rank, 0 (good) to 5 (hazardous or severe), shared by both standards for colouring. */
export type AqiLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** A named AQI band in one standard. */
export interface AqiCategory {
  level: AqiLevel;
  label: string;
  /** Short guidance for the general public. */
  advice: string;
}

/** US EPA bands, keyed by the highest AQI in each. */
const US_CATEGORIES: readonly [number, AqiCategory][] = [
  [50, { level: 0, label: 'Good', advice: 'Air is clean. Enjoy time outside.' }],
  [
    100,
    {
      level: 1,
      label: 'Moderate',
      advice: 'Unusually sensitive people should ease off long outdoor effort.',
    },
  ],
  [
    150,
    {
      level: 2,
      label: 'Unhealthy for sensitive groups',
      advice: 'Children, older adults and people with asthma should limit outdoor effort.',
    },
  ],
  [
    200,
    { level: 3, label: 'Unhealthy', advice: 'Everyone should cut long or heavy outdoor effort.' },
  ],
  [
    300,
    { level: 4, label: 'Very unhealthy', advice: 'Stay indoors with filtered air where you can.' },
  ],
  [
    Infinity,
    { level: 5, label: 'Hazardous', advice: 'Health warning for everyone. Avoid going outside.' },
  ],
];

/** India NAQI (CPCB) bands, keyed by the highest AQI in each. */
const IN_CATEGORIES: readonly [number, AqiCategory][] = [
  [50, { level: 0, label: 'Good', advice: 'Minimal impact.' }],
  [
    100,
    { level: 1, label: 'Satisfactory', advice: 'Minor breathing discomfort for sensitive people.' },
  ],
  [
    200,
    {
      level: 2,
      label: 'Moderate',
      advice: 'Discomfort for people with lung or heart disease, children and older adults.',
    },
  ],
  [
    300,
    { level: 3, label: 'Poor', advice: 'Breathing discomfort for most people on long exposure.' },
  ],
  [400, { level: 4, label: 'Very poor', advice: 'Respiratory illness on prolonged exposure.' }],
  [
    Infinity,
    {
      level: 5,
      label: 'Severe',
      advice: 'Affects healthy people and seriously impacts those with existing disease.',
    },
  ],
];

/** Category, label and public advice for an AQI value in the given standard. */
export function aqiCategory(aqi: number, standard: AqiStandard): AqiCategory {
  const list = standard === 'us' ? US_CATEGORIES : IN_CATEGORIES;
  for (const [max, cat] of list) if (aqi <= max) return cat;
  // Only NaN gets past the Infinity bound; report it as the top of the scale.
  return defined(list.at(-1), 'AQI category table')[1];
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
