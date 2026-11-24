/**
 * Background layers of the area chart, drawn back to front: shaded bands, grid, threshold lines
 * and the series itself. They draw from the pixel frame built in ./geometry and hold no state.
 */
import { PAD, type Band, type ChartFrame, type Threshold } from './geometry';

/** The area gradient and the hatch pattern used for smog-lid bands. */
export function ChartDefs({ gradId, hatchId }: { gradId: string; hatchId: string }) {
  return (
    <defs>
      <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.28" />
        <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
      </linearGradient>
      <pattern
        id={hatchId}
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="8"
          stroke="var(--amber)"
          strokeOpacity="0.28"
          strokeWidth="3"
        />
      </pattern>
    </defs>
  );
}

interface BandsProps {
  frame: ChartFrame;
  bands: Band[];
  count: number;
  hatchId: string;
}

/** Shaded spans behind the series: hatched lid hours and the tinted clean window. */
export function BandRects({ frame, bands, count, hatchId }: BandsProps) {
  const { x, height } = frame;
  return (
    <>
      {bands.map((b, i) => (
        <rect
          key={i}
          x={x(b.from)}
          y={PAD.top}
          width={Math.max(2, x(Math.min(count - 1, b.to)) - x(b.from))}
          height={height - PAD.top - PAD.bottom}
          fill={b.kind === 'lid' ? `url(#${hatchId})` : 'var(--green)'}
          fillOpacity={b.kind === 'lid' ? 1 : 0.1}
        />
      ))}
    </>
  );
}

interface GridProps {
  frame: ChartFrame;
  ticks: number[];
  format: (v: number) => string;
}

/** Hairline horizontal grid with value labels on the left. */
export function GridLines({ frame, ticks, format }: GridProps) {
  const { y, width } = frame;
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--line)"
            strokeDasharray={t === 0 ? undefined : '3 4'}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={PAD.left - 8}
            y={y(t)}
            dy="0.32em"
            textAnchor="end"
            fontSize="11"
            fill="var(--subtle)"
            className="tabular"
          >
            {format(t)}
          </text>
        </g>
      ))}
    </>
  );
}

interface ThresholdProps {
  frame: ChartFrame;
  thresholds: Threshold[];
  maxV: number;
}

/** Dashed guide lines for the thresholds that fit inside the plotted range. */
export function ThresholdLines({ frame, thresholds, maxV }: ThresholdProps) {
  const { y, width } = frame;
  return (
    <>
      {thresholds
        .filter((t) => t.value < maxV)
        .map((t) => (
          <g key={t.label}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t.value)}
              y2={y(t.value)}
              stroke="var(--muted)"
              strokeOpacity="0.55"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={width - PAD.right - 4}
              y={y(t.value) - 5}
              textAnchor="end"
              fontSize="11"
              fill="var(--muted)"
            >
              {t.label}
            </text>
          </g>
        ))}
    </>
  );
}

/** The series itself: gradient area under a solid line. */
export function SeriesPaths({
  path,
  fill,
  gradId,
}: {
  path: string;
  fill: string;
  gradId: string;
}) {
  return (
    <>
      <path d={fill} fill={`url(#${gradId})`} />
      <path
        d={path}
        fill="none"
        stroke="var(--blue)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}
