import type { AqiResult } from '@/lib/air/aqi';
import type { AirSnapshot } from '@/lib/air/types';
import { fmtDec, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { METRICS, type Metric, type MetricInfo } from './metrics';
import { metricReading } from './series';

interface MetricTabsProps {
  metric: Metric;
  onSelect: (metric: Metric) => void;
  air: AirSnapshot;
  instantAqi: readonly AqiResult[];
}

/** KPI tabs across the top of the chart: each shows its value now and the change since yesterday. */
export function MetricTabs({ metric, onSelect, air, instantAqi }: MetricTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Metric"
      className="grid grid-cols-2 border-b border-line sm:grid-cols-5"
    >
      {METRICS.map((m) => (
        <MetricTab
          key={m.key}
          info={m}
          selected={metric === m.key}
          onSelect={onSelect}
          air={air}
          instantAqi={instantAqi}
        />
      ))}
    </div>
  );
}

interface MetricTabProps {
  info: MetricInfo;
  selected: boolean;
  onSelect: (metric: Metric) => void;
  air: AirSnapshot;
  instantAqi: readonly AqiResult[];
}

function MetricTab({ info, selected, onSelect, air, instantAqi }: MetricTabProps) {
  const reading = metricReading(info.key, air, instantAqi);
  const rising = reading.delta > 0;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(info.key)}
      className={cn(
        'relative flex flex-col items-start gap-1 border-line px-5 py-4 text-left transition-colors duration-150 [&:not(:last-child)]:border-r',
        selected ? 'bg-surface' : 'bg-surface-2 hover:bg-hover',
      )}
    >
      <span className="text-[13px] text-muted">
        {info.label}
        {info.unit && <span className="text-subtle"> · {info.unit}</span>}
      </span>
      <span className="tabular text-2xl font-semibold tracking-[-0.03em] text-fg">
        {fmtInt(reading.cur)}
      </span>
      <span className={cn('tabular text-xs font-medium', rising ? 'text-red' : 'text-green')}>
        {rising ? '+' : ''}
        {fmtDec(reading.delta, 0)}% vs 24 h ago
      </span>
      {selected && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-fg" />}
    </button>
  );
}
