/**
 * The forecast's area chart. Its static layers are memoised, so moving the pointer re-renders
 * only the crosshair and the reading.
 */
import { memo, useId, useMemo, useRef, type PointerEvent } from 'react';
import {
  buildGeometry,
  type Band,
  type ChartGeometry,
  type ChartPoint,
  type Threshold,
} from './geometry';
import { useChartCursor, useElementWidth } from './useChartInteraction';
import { BandRects, ChartDefs, GridLines, SeriesPaths, ThresholdLines } from './ChartLayers';
import { ChartReading, Crosshair, NowMarker, XLabels } from './ChartMarks';

export type { Band, ChartPoint, Threshold } from './geometry';

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

const NO_BANDS: Band[] = [];
const NO_THRESHOLDS: Threshold[] = [];
const roundFormat = (v: number) => String(Math.round(v));

interface StaticLayersProps {
  geo: ChartGeometry;
  data: ChartPoint[];
  nowIndex: number | undefined;
  bands: Band[];
  thresholds: Threshold[];
  gradId: string;
  format: (v: number) => string;
}

/**
 * Everything that does not follow the cursor, drawn back to front. Memoised: its props keep
 * their identity while the pointer moves, so none of these layers re-render with the crosshair.
 */
const StaticLayers = memo(function StaticLayers(props: StaticLayersProps) {
  const { geo, data, nowIndex, bands, thresholds, gradId, format } = props;
  const hatchId = `${gradId}-hatch`;
  return (
    <>
      <ChartDefs gradId={gradId} hatchId={hatchId} />
      <BandRects frame={geo} bands={bands} count={data.length} hatchId={hatchId} />
      <GridLines frame={geo} ticks={geo.ticks} format={format} />
      <ThresholdLines frame={geo} thresholds={thresholds} maxV={geo.maxV} />
      <SeriesPaths path={geo.path} fill={geo.fill} gradId={gradId} />
      <NowMarker frame={geo} nowIndex={nowIndex} count={data.length} />
      <XLabels frame={geo} data={data} />
    </>
  );
});

/**
 * Analytics-style area chart: one series, hairline grid, a crosshair that follows the pointer
 * or the arrow keys, shaded bands (smog-lid hours, the clean window) and labelled thresholds.
 */
export function AreaChart({
  data,
  nowIndex,
  bands = NO_BANDS,
  thresholds = NO_THRESHOLDS,
  unit,
  ariaLabel,
  height = 280,
  format = roundFormat,
}: Props) {
  const gradId = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const W = useElementWidth(wrapRef);

  const geo = useMemo(
    () => buildGeometry({ data, thresholds, width: W, height }),
    [data, height, thresholds, W],
  );
  const { cursor, release, pick, onKey } = useChartCursor({
    svgRef,
    x: geo.x,
    width: W,
    count: data.length,
    nowIndex,
  });
  const active = cursor == null ? null : (data[cursor] ?? null);
  const peak = useMemo(() => format(Math.max(...data.map((d) => d.value ?? 0))), [data, format]);
  const layers = { geo, data, nowIndex, bands, thresholds, gradId, format };

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        style={{ height }}
        role="img"
        aria-label={`${ariaLabel}. Peak ${peak} ${unit}. Use left and right arrow keys to read hourly values.`}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={(e: PointerEvent) => pick(e.clientX)}
        onPointerLeave={release}
        onBlur={release}
      >
        <StaticLayers {...layers} />
        <Crosshair frame={geo} cursor={cursor} point={active} />
      </svg>

      <ChartReading
        point={active}
        leftPct={cursor == null ? 0 : (geo.x(cursor) / W) * 100}
        unit={unit}
        format={format}
      />
    </div>
  );
}
