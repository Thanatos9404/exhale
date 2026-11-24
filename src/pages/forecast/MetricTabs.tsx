/**
 * The Forecast metric tabs: a WAI-ARIA tablist that is one Tab stop, where Left and Right move
 * and select, Home and End jump to the ends, and each tab can point at the chart's tab panel.
 */
import type { AqiResult } from '@/lib/air/aqi';
import type { AirSnapshot } from '@/lib/air/types';
import { fmtDec, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { rovingItemProps, type RovingGroup } from '@/components/ui/roving';
import { METRICS, type Metric, type MetricInfo } from './metrics';
import { metricReading } from './series';

/** The id the chart's tab panel carries so the tabs can reference it with `aria-controls`. */
export const METRIC_PANEL_ID = 'forecast-metric-panel';

/** The id of a metric's tab, for the tab panel's `aria-labelledby`. */
export const metricTabId = (metric: Metric) => `forecast-metric-tab-${metric}`;

const METRIC_KEYS = METRICS.map((m) => m.key);

interface MetricTabsProps {
  metric: Metric;
  onSelect: (metric: Metric) => void;
  air: AirSnapshot;
  instantAqi: readonly AqiResult[];
  /** Id of the rendered tab panel. `aria-controls` is only set when the panel carries it. */
  panelId?: string;
}

/** KPI tabs across the top of the chart: each shows its value now and the change since yesterday. */
export function MetricTabs({ metric, onSelect, air, instantAqi, panelId }: MetricTabsProps) {
  const group: RovingGroup<Metric> = {
    values: METRIC_KEYS,
    value: metric,
    onChange: onSelect,
    axis: 'horizontal',
  };
  return (
    <div
      role="tablist"
      aria-label="Metric"
      className="grid grid-cols-2 border-b border-line sm:grid-cols-5"
    >
      {METRICS.map((m, index) => {
        const reading = metricReading(m.key, air, instantAqi);
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            id={metricTabId(m.key)}
            aria-selected={metric === m.key}
            aria-controls={panelId}
            onClick={() => onSelect(m.key)}
            {...rovingItemProps(group, index)}
            className={cn(
              'relative flex min-h-11 flex-col items-start gap-1 border-line px-5 py-4 text-left transition-colors duration-150 focus-visible:z-10 focus-visible:rounded-none focus-visible:-outline-offset-2 [&:not(:last-child)]:border-r',
              metric === m.key ? 'bg-surface' : 'bg-surface-2 hover:bg-hover',
            )}
          >
            <MetricTabBody info={m} cur={reading.cur} delta={reading.delta} />
            {metric === m.key && (
              <span
                aria-hidden="true"
                className="ui-tab-indicator absolute inset-x-0 top-0 h-0.5 bg-fg"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface MetricTabBodyProps {
  info: MetricInfo;
  cur: number;
  delta: number;
}

/** What a tab shows: the metric's name and unit, its value now, and the change in 24 hours. */
function MetricTabBody({ info, cur, delta }: MetricTabBodyProps) {
  const rising = delta > 0;
  return (
    <>
      <span className="text-[13px] text-muted">
        {info.label}
        {info.unit && <span className="text-subtle"> · {info.unit}</span>}
      </span>
      <span className="tabular text-2xl font-semibold tracking-[-0.03em] text-fg">
        {fmtInt(cur)}
      </span>
      <span className={cn('tabular text-xs font-medium', rising ? 'text-red' : 'text-green')}>
        {rising ? '+' : ''}
        {fmtDec(delta, 0)}% vs 24 h ago
      </span>
    </>
  );
}
