/**
 * Pure data shaping for the Forecast page. It turns an air snapshot into what each part of the
 * page draws: the chart window with its bands, the data-table rows, metric readings, the
 * pollutant mix and the cleanest hours. No React.
 */
import type { Band, ChartPoint } from '@/components/charts/AreaChart';
import type { AqiResult } from '@/lib/air/aqi';
import type { AirSnapshot, HourPoint, Pollutant } from '@/lib/air/types';
import { isLidHour } from '@/lib/science/meteo';
import { fmtDec, fmtInt } from '@/lib/format';
import {
  POLLUTANTS,
  SEGMENT_COLOR,
  WHO,
  type ForecastRange,
  type Metric,
  type SegmentColorVar,
} from './metrics';

/** Hours of history shown before "now" on the chart. */
const PAST_HOURS = 12;

/** Short weekday ("Mon") for a local wall-clock ISO time such as "2026-11-23T06:00". */
export function weekdayLabel(time: string): string {
  return new Date(`${time}:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/** X-axis label: the weekday at midnight, otherwise the clock time. */
export function axisLabel(time: string): string {
  return time.slice(11, 13) === '00' ? weekdayLabel(time) : time.slice(11, 16);
}

/** Contiguous runs of smog-lid hours, as chart bands. */
export function lidBands(hours: readonly HourPoint[]): Band[] {
  const bands: Band[] = [];
  let start: number | null = null;
  hours.forEach((h, i) => {
    if (isLidHour(h) && start == null) start = i;
    if ((!isLidHour(h) || i === hours.length - 1) && start != null) {
      bands.push({ from: start, to: i, kind: 'lid' });
      start = null;
    }
  });
  return bands;
}

/** A one-hour band on the plan's cleanest hour, when it falls at or after now within view. */
export function cleanBand(
  hours: readonly HourPoint[],
  firstFutureLocal: number,
  cleanStart: string | undefined,
): Band | null {
  if (cleanStart === undefined) return null;
  const i = hours.findIndex((h, j) => j >= firstFutureLocal && h.time.slice(11, 16) === cleanStart);
  return i >= 0 ? { from: i, to: i + 1, kind: 'clean' } : null;
}

/** What the chart window is built from. */
export interface ChartViewInput {
  air: AirSnapshot;
  instantAqi: readonly AqiResult[];
  metric: Metric;
  range: ForecastRange;
  /** Start ("HH:MM") of the plan's cleanest window, if it has one. */
  cleanStart: string | undefined;
}

/** The slice of hours on the chart, with its points and shaded bands. */
export interface ChartView {
  /** Index into `air.hourly` of the first hour in view. */
  from: number;
  hours: HourPoint[];
  points: ChartPoint[];
  bands: Band[];
  /** Index of the current hour within `hours`. */
  nowLocal: number;
}

/** The chart window (past 12 h plus the chosen range) with its points and shaded bands. */
export function buildChartView({
  air,
  instantAqi,
  metric,
  range,
  cleanStart,
}: ChartViewInput): ChartView {
  const from = Math.max(0, air.nowIndex - PAST_HOURS);
  const to = Math.min(air.hourly.length, air.nowIndex + Number(range));
  const hours = air.hourly.slice(from, to);
  const nowLocal = air.nowIndex - from;
  const points = hours.map((h, i) => ({
    label: axisLabel(h.time),
    value: metric === 'aqi' ? (instantAqi[from + i]?.aqi ?? null) : h[metric],
  }));
  const bands = lidBands(hours);
  const clean = cleanBand(hours, nowLocal, cleanStart);
  if (clean) bands.push(clean);
  return { from, hours, points, bands, nowLocal };
}

/** One formatted row of the hour-by-hour data table. */
export interface HourRow {
  key: string;
  time: string;
  value: string;
  blh: string;
  wind: string;
}

/** Rows for the accessible data table under the chart, formatted for display. */
export function hourRows(view: ChartView): HourRow[] {
  return view.hours.map((h, i) => {
    const value = view.points[i]?.value ?? null;
    return {
      key: h.time,
      time: h.time.replace('T', ' '),
      value: value == null ? 'n/a' : fmtInt(value),
      blh: h.blh == null ? 'n/a' : `${fmtInt(h.blh)} m`,
      wind: h.wind == null ? 'n/a' : `${fmtDec(h.wind, 1)} km/h`,
    };
  });
}

/** A metric's current value and its day-on-day change. */
export interface MetricReading {
  cur: number;
  /** Percent change against the same metric 24 hours earlier. */
  delta: number;
}

function metricAt(
  metric: Metric,
  air: AirSnapshot,
  instantAqi: readonly AqiResult[],
  index: number,
): number {
  if (metric === 'aqi') return instantAqi[index]?.aqi ?? 0;
  return air.hourly[index]?.[metric] ?? 0;
}

/** A metric's value now and its change against 24 hours ago. */
export function metricReading(
  metric: Metric,
  air: AirSnapshot,
  instantAqi: readonly AqiResult[],
): MetricReading {
  const cur = metricAt(metric, air, instantAqi, air.nowIndex);
  const prev = metricAt(metric, air, instantAqi, Math.max(0, air.nowIndex - 24));
  return { cur, delta: prev > 0 ? ((cur - prev) / prev) * 100 : 0 };
}

/** One pollutant's arc in the mix donut. */
export interface PollutantSegment {
  key: Pollutant;
  /** How many times over its WHO guideline the pollutant is. */
  ratio: number;
  color: string;
}

/** One donut segment per pollutant, sized by its multiple of the WHO guideline. */
export function pollutantSegments(
  now: HourPoint,
  colors: Record<SegmentColorVar, string>,
): PollutantSegment[] {
  return POLLUTANTS.map((p) => ({
    key: p,
    ratio: (now[p] ?? 0) / WHO[p],
    color: colors[SEGMENT_COLOR[p]],
  }));
}

/** The segment furthest over its guideline. */
export function worstSegment(segments: readonly PollutantSegment[]): PollutantSegment {
  return segments.reduce((a, b) => (b.ratio > a.ratio ? b : a));
}

/** The next `count` hours starting with the current one. */
export function upcomingHours(air: AirSnapshot, count: number): HourPoint[] {
  return air.hourly.slice(air.nowIndex, air.nowIndex + count);
}

/** An hour with a PM2.5 reading. */
export type MeasuredHour = HourPoint & { pm25: number };

/** The `count` hours with the lowest PM2.5, cleanest first; hours without a reading are skipped. */
export function cleanestHours(hours: readonly HourPoint[], count: number): MeasuredHour[] {
  return hours
    .filter((h): h is MeasuredHour => h.pm25 != null)
    .sort((a, b) => a.pm25 - b.pm25)
    .slice(0, count);
}
