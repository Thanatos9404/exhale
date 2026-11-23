import { useMemo } from 'react';
import type { AqiResult } from '@/lib/air/aqi';
import type { AirSnapshot } from '@/lib/air/types';
import type { ForecastRange, Metric } from './metrics';
import { buildChartView, type ChartView } from './series';

/** The memoised chart window for the chosen metric and range; null until data has loaded. */
export function useChartView(
  air: AirSnapshot | undefined,
  instantAqi: readonly AqiResult[] | undefined,
  metric: Metric,
  range: ForecastRange,
  cleanStart: string | undefined,
): ChartView | null {
  return useMemo(
    () =>
      air && instantAqi ? buildChartView({ air, instantAqi, metric, range, cleanStart }) : null,
    [air, instantAqi, metric, range, cleanStart],
  );
}
