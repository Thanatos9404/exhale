/**
 * Memoises the forecast chart window so it is rebuilt only when the data, the metric or the range
 * changes. The building itself is in ./series.
 */
import { useMemo } from 'react';
import type { AqiResult } from '@/lib/air/aqi';
import type { AirSnapshot } from '@/lib/air/types';
import type { ForecastRange, Metric } from './metrics';
import { buildChartView, type ChartView } from './series';

interface ChartViewInput {
  air: AirSnapshot | undefined;
  instantAqi: readonly AqiResult[] | undefined;
  metric: Metric;
  range: ForecastRange;
  /** Start of the plan's clean window, when it has one. */
  cleanStart: string | undefined;
}

/** The memoised chart window for the chosen metric and range; null until data has loaded. */
export function useChartView({
  air,
  instantAqi,
  metric,
  range,
  cleanStart,
}: ChartViewInput): ChartView | null {
  return useMemo(
    () =>
      air && instantAqi ? buildChartView({ air, instantAqi, metric, range, cleanStart }) : null,
    [air, instantAqi, metric, range, cleanStart],
  );
}
