import { aqiCategory, type AqiLevel, type AqiResult } from '@/lib/air/aqi';
import type { AirSnapshot, AqiStandard, HourPoint } from '@/lib/air/types';
import { dayHourLabel } from '@/lib/format';
import { dispersionClass, ventilationCoefficient, type Dispersion } from '@/lib/science/meteo';

/** How far ahead the scrubber reaches, in hours. */
export const SCRUB_HOURS = 48;

/** Hours shown in the colour strip under the scrubber. */
const STRIP_HOURS = 24;

/** AQI per hour, as returned by `useAqiSeries`. */
export interface AqiSeries {
  official: AqiResult[];
  instant: AqiResult[];
}

/** One coloured cell in the hour strip. */
export interface HourCell {
  /** Index into the hourly series. */
  index: number;
  /** Hours ahead of now. */
  offset: number;
  hour: HourPoint;
  level: AqiLevel;
}

/** Everything the overview shows for the hour the scrubber is on. */
export interface ScrubbedHour {
  /** True while the scrubber sits on the current hour. */
  isNow: boolean;
  /** Scrubber position, clamped to the data that exists. */
  offset: number;
  maxOffset: number;
  index: number;
  hour: HourPoint;
  /** Instant AQI for the scrubbed hour. */
  instant: AqiResult;
  /** Official (trailing average) AQI for the current hour. */
  official: AqiResult;
  level: AqiLevel;
  label: string;
  pm25: number;
  dispersion: Dispersion | null;
  cells: HourCell[];
}

/** The next 24 hours from now, each with its instant AQI level. */
function hourCells(
  air: AirSnapshot,
  instant: readonly AqiResult[],
  standard: AqiStandard,
): HourCell[] {
  const end = Math.min(air.hourly.length, air.nowIndex + STRIP_HOURS);
  return air.hourly.slice(air.nowIndex, end).flatMap((hour, k): HourCell[] => {
    const index = air.nowIndex + k;
    const reading = instant[index];
    if (!reading) return [];
    return [{ index, offset: k, hour, level: aqiCategory(reading.aqi, standard).level }];
  });
}

/**
 * Resolves the scrubber position against the data. Returns null when the series has no reading
 * for that hour, which callers treat like data that has not arrived yet.
 */
export function scrubHour(
  air: AirSnapshot,
  aqi: AqiSeries,
  offset: number,
  standard: AqiStandard,
): ScrubbedHour | null {
  const maxOffset = Math.min(SCRUB_HOURS - 1, air.hourly.length - 1 - air.nowIndex);
  const clamped = Math.min(offset, maxOffset);
  const index = air.nowIndex + clamped;
  const hour = air.hourly[index];
  const instant = aqi.instant[index];
  const official = aqi.official[air.nowIndex];
  if (!hour || !instant || !official) return null;
  const isNow = offset === 0;
  return {
    isNow,
    offset: clamped,
    maxOffset,
    index,
    hour,
    instant,
    official,
    level: aqiCategory(instant.aqi, standard).level,
    label: isNow ? 'Now' : dayHourLabel(hour.time),
    pm25: hour.pm25 ?? 0,
    dispersion: dispersionClass(ventilationCoefficient(hour.blh, hour.wind)),
    cells: hourCells(air, aqi.instant, standard),
  };
}
