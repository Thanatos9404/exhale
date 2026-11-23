import { useState } from 'react';
import { AreaChart } from '@/components/charts/AreaChart';
import type { AqiStandard } from '@/lib/air/types';
import { METRIC_INFO, THRESHOLDS, type ForecastRange, type Metric } from './metrics';
import { hourRows, type ChartView, type HourRow } from './series';

interface ChartPanelProps {
  metric: Metric;
  view: ChartView;
  standard: AqiStandard;
  placeLabel: string;
  range: ForecastRange;
}

/** The selected metric's chart with its legend and an optional hour-by-hour data table. */
export function ChartPanel({ metric, view, standard, placeLabel, range }: ChartPanelProps) {
  const [showTable, setShowTable] = useState(false);
  const active = METRIC_INFO[metric];
  return (
    <div role="tabpanel" aria-label={`${active.label} chart`} className="p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 bg-blue" aria-hidden="true" /> {active.label}
          {metric === 'aqi' ? ' (hourly)' : ''}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-4 bg-[repeating-linear-gradient(135deg,var(--amber)_0_2px,transparent_2px_5px)] opacity-60"
          />{' '}
          Smog lid hours
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-4 rounded-sm bg-green/25" /> Cleanest hour
        </span>
        <button
          type="button"
          onClick={() => setShowTable((t) => !t)}
          aria-expanded={showTable}
          className="ml-auto font-medium text-fg hover:underline"
        >
          {showTable ? 'Hide data table' : 'Show data table'}
        </button>
      </div>
      <AreaChart
        data={view.points}
        nowIndex={view.nowLocal}
        bands={view.bands}
        thresholds={THRESHOLDS[metric](standard)}
        unit={active.unit || 'AQI'}
        ariaLabel={`${active.label} for ${placeLabel}, past 12 hours and next ${range} hours`}
      />
      {showTable && <HourTable label={active.label} rows={hourRows(view)} />}
    </div>
  );
}

interface HourTableProps {
  label: string;
  rows: readonly HourRow[];
}

function HourTable({ label, rows }: HourTableProps) {
  return (
    <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-line">
      <table className="tabular w-full text-left text-[13px]">
        <caption className="sr-only">{label} by hour</caption>
        <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Time
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {label}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Mixing height
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Wind
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-line">
              <td className="px-3 py-1.5">{row.time}</td>
              <td className="px-3 py-1.5">{row.value}</td>
              <td className="px-3 py-1.5">{row.blh}</td>
              <td className="px-3 py-1.5">{row.wind}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
