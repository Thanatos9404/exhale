/**
 * The chart's interaction state: its measured width, and the crosshair moved by the pointer or
 * the keyboard. The chart's position is measured once per interaction, not on every move.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { ScaleLinear } from 'd3-scale';
import { cursorForKey } from './geometry';

/** Tracks the rendered width of an element so the chart draws in real pixels. */
export function useElementWidth(ref: RefObject<HTMLElement | null>, initial = 800): number {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

interface CursorInput {
  svgRef: RefObject<SVGSVGElement | null>;
  x: ScaleLinear<number, number>;
  width: number;
  count: number;
  nowIndex: number | undefined;
}

/** The crosshair position, moved by the pointer or by the arrow, Home, End and Escape keys. */
export function useChartCursor({ svgRef, x, width, count, nowIndex }: CursorInput) {
  const [cursor, setCursor] = useState<number | null>(null);
  /** Where the chart sits on screen, measured on the first move of each pointer interaction. */
  const box = useRef<DOMRect | null>(null);

  // A resize moves the chart, so the next move measures again.
  useEffect(() => {
    box.current = null;
  }, [width]);

  const pick = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    box.current ??= svg.getBoundingClientRect();
    const rect = box.current;
    const px = ((clientX - rect.left) / rect.width) * width;
    const i = Math.round(x.invert(px));
    setCursor(Math.min(count - 1, Math.max(0, i)));
  };

  const onKey = (e: KeyboardEvent) => {
    const next = cursorForKey(e.key, cursor ?? nowIndex ?? 0, count - 1);
    if (next === undefined) return;
    setCursor(next);
    e.preventDefault();
  };

  /** Ends the interaction: hides the crosshair and forgets the measured position. */
  const release = () => {
    box.current = null;
    setCursor(null);
  };

  return { cursor, release, pick, onKey };
}
