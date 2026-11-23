import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { area, curveMonotoneX, line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { cn } from '@/lib/cn';

/**
 * Analytics-style area chart: one series, hairline grid, a crosshair that follows the pointer
 * or the arrow keys, shaded bands (smog-lid hours, the clean window) and labelled thresholds.
 */

export interface ChartPoint {
  label: string;
  value: number | null;
}

export interface Band {
  from: number;
  to: number;
  kind: 'lid' | 'clean';
}

export interface Threshold {
  value: number;
  label: string;
}

interface Props {
  data: ChartPoint[];
  nowIndex?: number;
  bands?: Band[];
  thresholds?: Threshold[];
  unit: string;
  ariaLabel: string;
  height?: number;
  format?: (v: number) => string;
}

const PAD = { top: 16, right: 8, bottom: 26, left: 40 };

export function AreaChart({
  data,
  nowIndex,
  bands = [],
  thresholds = [],
  unit,
  ariaLabel,
  height = 280,
  format = (v) => String(Math.round(v)),
}: Props) {
  const gradId = useId().replace(/:/g, '');
  const hatchId = `${gradId}-hatch`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);

  // Draw in real pixels so text and strokes never stretch.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { x, y, path, fill, ticks, maxV } = useMemo(() => {
    const vals = data.map((d) => d.value ?? 0);
    const maxV = Math.max(10, ...vals, ...thresholds.map((t) => t.value)) * 1.12;
    const x = scaleLinear()
      .domain([0, Math.max(1, data.length - 1)])
      .range([PAD.left, W - PAD.right]);
    const y = scaleLinear()
      .domain([0, maxV])
      .range([height - PAD.bottom, PAD.top])
      .nice();
    const defined = (d: ChartPoint) => d.value != null;
    const path =
      line<ChartPoint>()
        .defined(defined)
        .x((_, i) => x(i))
        .y((d) => y(d.value ?? 0))
        .curve(curveMonotoneX)(data) ?? '';
    const fill =
      area<ChartPoint>()
        .defined(defined)
        .x((_, i) => x(i))
        .y0(y(0))
        .y1((d) => y(d.value ?? 0))
        .curve(curveMonotoneX)(data) ?? '';
    return { x, y, path, fill, ticks: y.ticks(4), maxV };
  }, [data, height, thresholds, W]);

  const labelEvery = Math.max(1, Math.round(data.length / Math.max(3, Math.floor(W / 90))));

  const pick = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(x.invert(px));
    setCursor(Math.min(data.length - 1, Math.max(0, i)));
  };

  const onKey = (e: KeyboardEvent) => {
    const cur = cursor ?? nowIndex ?? 0;
    if (e.key === 'ArrowRight') setCursor(Math.min(data.length - 1, cur + 1));
    else if (e.key === 'ArrowLeft') setCursor(Math.max(0, cur - 1));
    else if (e.key === 'Home') setCursor(0);
    else if (e.key === 'End') setCursor(data.length - 1);
    else if (e.key === 'Escape') setCursor(null);
    else return;
    e.preventDefault();
  };

  const active = cursor != null ? data[cursor] : null;
  const tipLeft = cursor != null ? (x(cursor) / W) * 100 : 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        style={{ height }}
        role="img"
        aria-label={`${ariaLabel}. Peak ${format(Math.max(...data.map((d) => d.value ?? 0)))} ${unit}. Use left and right arrow keys to read hourly values.`}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={(e: PointerEvent) => pick(e.clientX)}
        onPointerLeave={() => setCursor(null)}
        onBlur={() => setCursor(null)}
      >
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

        {bands.map((b, i) => (
          <rect
            key={i}
            x={x(b.from)}
            y={PAD.top}
            width={Math.max(2, x(Math.min(data.length - 1, b.to)) - x(b.from))}
            height={height - PAD.top - PAD.bottom}
            fill={b.kind === 'lid' ? `url(#${hatchId})` : 'var(--green)'}
            fillOpacity={b.kind === 'lid' ? 1 : 0.1}
          />
        ))}

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
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

        {thresholds
          .filter((t) => t.value < maxV)
          .map((t) => (
            <g key={t.label}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t.value)}
                y2={y(t.value)}
                stroke="var(--muted)"
                strokeOpacity="0.55"
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={W - PAD.right - 4}
                y={y(t.value) - 5}
                textAnchor="end"
                fontSize="11"
                fill="var(--muted)"
              >
                {t.label}
              </text>
            </g>
          ))}

        <path d={fill} fill={`url(#${gradId})`} />
        <path
          d={path}
          fill="none"
          stroke="var(--blue)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {nowIndex != null && nowIndex >= 0 && nowIndex < data.length && (
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
            <text
              x={x(nowIndex) + 6}
              y={PAD.top + 10}
              fontSize="11"
              fill="var(--fg)"
              fontWeight="600"
            >
              Now
            </text>
          </g>
        )}

        {data.map((d, i) =>
          i % labelEvery === 0 ? (
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

        {cursor != null && active?.value != null && (
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
              cy={y(active.value)}
              r="4.5"
              fill="var(--surface)"
              stroke="var(--blue)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>

      <div aria-live="polite" className="sr-only">
        {active
          ? `${active.label}: ${active.value == null ? 'no data' : `${format(active.value)} ${unit}`}`
          : ''}
      </div>

      {active && (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-2 z-10 min-w-[120px] rounded-lg border border-line bg-surface px-3 py-2 shadow-pop',
            tipLeft > 70 ? '-translate-x-[calc(100%+12px)]' : 'translate-x-3',
          )}
          style={{ left: `${tipLeft}%` }}
        >
          <div className="text-xs text-muted">{active.label}</div>
          <div className="tabular mt-0.5 text-sm font-semibold text-fg">
            {active.value == null ? 'No data' : `${format(active.value)} ${unit}`}
          </div>
        </div>
      )}
    </div>
  );
}
