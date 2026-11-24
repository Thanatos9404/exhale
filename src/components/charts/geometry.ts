/**
 * Pure geometry for the area chart: scales, paths and ticks for a size, label spacing, where a
 * key press moves the crosshair, and the text of a reading. No React, so it can be tested
 * without rendering anything.
 */
import { area, curveMonotoneX, line } from 'd3-shape';
import { scaleLinear, type ScaleLinear } from 'd3-scale';

/** One plotted hour: its axis label and value, or `null` where the feed has a gap. */
export interface ChartPoint {
  label: string;
  value: number | null;
}

/** A shaded span of hours: smog-lid hours are hatched, the clean window is tinted. */
export interface Band {
  from: number;
  to: number;
  kind: 'lid' | 'clean';
}

/** A labelled horizontal guide line, such as a WHO limit. */
export interface Threshold {
  value: number;
  label: string;
}

/** Inner padding of the plot area, in pixels. */
export const PAD = { top: 16, right: 8, bottom: 26, left: 40 };

type Scale = ScaleLinear<number, number>;

/** The pixel frame every chart layer draws into. */
export interface ChartFrame {
  x: Scale;
  y: Scale;
  width: number;
  height: number;
}

/** Scales, paths and ticks for one series at one size. */
export interface ChartGeometry extends ChartFrame {
  path: string;
  fill: string;
  ticks: number[];
  maxV: number;
}

interface GeometryInput {
  data: ChartPoint[];
  thresholds: Threshold[];
  width: number;
  height: number;
}

const hasValue = (d: ChartPoint) => d.value != null;

/** Works out the scales and the line and area paths, drawn in real pixels. */
export function buildGeometry({ data, thresholds, width, height }: GeometryInput): ChartGeometry {
  const vals = data.map((d) => d.value ?? 0);
  const maxV = Math.max(10, ...vals, ...thresholds.map((t) => t.value)) * 1.12;
  const x = scaleLinear()
    .domain([0, Math.max(1, data.length - 1)])
    .range([PAD.left, width - PAD.right]);
  const y = scaleLinear()
    .domain([0, maxV])
    .range([height - PAD.bottom, PAD.top])
    .nice();
  const path =
    line<ChartPoint>()
      .defined(hasValue)
      .x((_, i) => x(i))
      .y((d) => y(d.value ?? 0))
      .curve(curveMonotoneX)(data) ?? '';
  const fill =
    area<ChartPoint>()
      .defined(hasValue)
      .x((_, i) => x(i))
      .y0(y(0))
      .y1((d) => y(d.value ?? 0))
      .curve(curveMonotoneX)(data) ?? '';
  return { x, y, width, height, path, fill, ticks: y.ticks(4), maxV };
}

/** How many points sit between two x-axis labels so they never collide. */
export function labelStep(count: number, width: number): number {
  return Math.max(1, Math.round(count / Math.max(3, Math.floor(width / 90))));
}

/** Where a key press moves the crosshair: `null` clears it, `undefined` means not a chart key. */
export function cursorForKey(key: string, cur: number, last: number): number | null | undefined {
  switch (key) {
    case 'ArrowRight':
      return Math.min(last, cur + 1);
    case 'ArrowLeft':
      return Math.max(0, cur - 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'Escape':
      return null;
    default:
      return undefined;
  }
}

/** The spoken or printed reading for one point. */
export function readout(
  point: ChartPoint,
  unit: string,
  format: (v: number) => string,
  missing: string,
): string {
  return point.value == null ? missing : `${format(point.value)} ${unit}`;
}
