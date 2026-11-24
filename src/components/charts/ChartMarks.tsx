/**
 * Foreground marks of the area chart: the Now marker, the axis labels, and the crosshair with
 * its reading. The reading is also a polite live region, so a screen reader hears the same
 * value the tooltip shows.
 */
import { cn } from '@/lib/cn';
import { PAD, labelStep, readout, type ChartFrame, type ChartPoint } from './geometry';

/** The vertical "Now" marker, drawn only when the index falls inside the series. */
export function NowMarker({
  frame,
  nowIndex,
  count,
}: {
  frame: ChartFrame;
  nowIndex: number | undefined;
  count: number;
}) {
  if (nowIndex == null || nowIndex < 0 || nowIndex >= count) return null;
  const { x, height } = frame;
  return (
    <g>
      <line
        x1={x(nowIndex)}
        x2={x(nowIndex)}
        y1={PAD.top}
        y2={height - PAD.bottom}
        stroke="var(--fg)"
        strokeOpacity="0.5"
        vectorEffect="non-scaling-stroke"
      />
      <text x={x(nowIndex) + 6} y={PAD.top + 10} fontSize="11" fill="var(--fg)" fontWeight="600">
        Now
      </text>
    </g>
  );
}

/** Hour labels along the x axis, thinned so they never collide. */
export function XLabels({ frame, data }: { frame: ChartFrame; data: ChartPoint[] }) {
  const { x, width, height } = frame;
  const every = labelStep(data.length, width);
  return (
    <>
      {data.map((d, i) =>
        i % every === 0 ? (
          <text
            key={i}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize="11"
            fill="var(--subtle)"
            className="tabular"
          >
            {d.label}
          </text>
        ) : null,
      )}
    </>
  );
}

/** The crosshair and dot at the hour being read. */
export function Crosshair({
  frame,
  cursor,
  point,
}: {
  frame: ChartFrame;
  cursor: number | null;
  point: ChartPoint | null;
}) {
  if (cursor == null || point?.value == null) return null;
  const { x, y, height } = frame;
  return (
    <g pointerEvents="none">
      <line
        x1={x(cursor)}
        x2={x(cursor)}
        y1={PAD.top}
        y2={height - PAD.bottom}
        stroke="var(--fg)"
        strokeOpacity="0.35"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={x(cursor)}
        cy={y(point.value)}
        r="4.5"
        fill="var(--surface)"
        stroke="var(--blue)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

interface ReadingProps {
  point: ChartPoint | null;
  /** Horizontal position of the crosshair, as a percentage of the chart width. */
  leftPct: number;
  unit: string;
  format: (v: number) => string;
}

/** The reading at the crosshair: a polite live region for screen readers and a visual tooltip. */
export function ChartReading({ point, leftPct, unit, format }: ReadingProps) {
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {point ? `${point.label}: ${readout(point, unit, format, 'no data')}` : ''}
      </div>

      {point && (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-2 z-10 min-w-[120px] rounded-lg border border-line bg-surface px-3 py-2 shadow-pop',
            leftPct > 70 ? '-translate-x-[calc(100%+12px)]' : 'translate-x-3',
          )}
          style={{ left: `${leftPct}%` }}
        >
          <div className="text-xs text-muted">{point.label}</div>
          <div className="tabular mt-0.5 text-sm font-semibold text-fg">
            {readout(point, unit, format, 'No data')}
          </div>
        </div>
      )}
    </>
  );
}
