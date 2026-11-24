/**
 * Static facts about what the forecast can plot: names and units, WHO guideline levels, colours
 * and the reference lines for each metric. Data only; the series maths is in ./series.
 */
import type { Threshold } from '@/components/charts/AreaChart';
import type { AqiStandard, Pollutant } from '@/lib/air/types';

/** What the forecast chart plots: the composite AQI or one pollutant. */
export type Metric = 'aqi' | Pollutant;

/** How many hours ahead the chart reaches. */
export type ForecastRange = '24' | '48' | '72';

/** Display name and unit for a metric. */
export interface MetricInfo {
  key: Metric;
  label: string;
  unit: string;
}

/** Display info for every metric, by key. */
export const METRIC_INFO: Record<Metric, MetricInfo> = {
  aqi: { key: 'aqi', label: 'AQI', unit: '' },
  pm25: { key: 'pm25', label: 'PM2.5', unit: 'µg/m³' },
  pm10: { key: 'pm10', label: 'PM10', unit: 'µg/m³' },
  no2: { key: 'no2', label: 'NO₂', unit: 'µg/m³' },
  o3: { key: 'o3', label: 'O₃', unit: 'µg/m³' },
};

/** Metric tabs in display order. */
export const METRICS: readonly MetricInfo[] = [
  METRIC_INFO.aqi,
  METRIC_INFO.pm25,
  METRIC_INFO.pm10,
  METRIC_INFO.no2,
  METRIC_INFO.o3,
];

/** Pollutants in the order the mix donut and its legend draw them. */
export const POLLUTANTS: readonly Pollutant[] = ['pm25', 'pm10', 'no2', 'o3'];

/** WHO 2021 guideline levels (24 h for PM and NO2, 8 h for O3). */
export const WHO: Record<Pollutant, number> = { pm25: 15, pm10: 45, no2: 25, o3: 100 };

/** Theme colour variables used for the pollutant mix. */
export const SEGMENT_COLOR_VARS = ['blue', 'amber', 'aqi-4', 'green'] as const;
/** One of the theme colour variables used for the pollutant mix. */
export type SegmentColorVar = (typeof SEGMENT_COLOR_VARS)[number];

/** The colour each pollutant is drawn in. */
export const SEGMENT_COLOR: Record<Pollutant, SegmentColorVar> = {
  pm25: 'blue',
  pm10: 'amber',
  no2: 'aqi-4',
  o3: 'green',
};

/** Labelled reference lines for each metric's chart, per AQI standard where it matters. */
export const THRESHOLDS: Record<Metric, (s: AqiStandard) => Threshold[]> = {
  aqi: (s) =>
    s === 'in'
      ? [
          { value: 100, label: 'Satisfactory limit' },
          { value: 200, label: 'Moderate limit' },
        ]
      : [
          { value: 100, label: 'Moderate limit' },
          { value: 150, label: 'Sensitive groups' },
        ],
  pm25: () => [
    { value: 15, label: 'WHO 24 h' },
    { value: 60, label: 'India 24 h standard' },
  ],
  pm10: () => [
    { value: 45, label: 'WHO 24 h' },
    { value: 100, label: 'India 24 h standard' },
  ],
  no2: () => [
    { value: 25, label: 'WHO 24 h' },
    { value: 80, label: 'India 24 h standard' },
  ],
  o3: () => [{ value: 100, label: 'WHO 8 h' }],
};
