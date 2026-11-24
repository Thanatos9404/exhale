/**
 * A cutaway room drawn on canvas. Particle count tracks the modelled indoor PM2.5; an open
 * window lets particles stream in, a purifier pulls them out, and indoor sources puff from the floor.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { useLatest } from '@/hooks/useLatest';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { subscribeToTheme } from '@/hooks/useThemeColors';
import {
  fitCanvas,
  readRoomColors,
  stepRoom,
  type RoomParticlesProps,
  type RoomScene,
} from './roomSimulation';

export type { RoomParticlesProps } from './roomSimulation';

interface RoomRun {
  /** Paints one frame now; the loop carries on from there unless motion is reduced. */
  redraw: () => void;
  stop: () => void;
}

/**
 * Starts the room on a canvas: sizes it, reads the theme colours once (and again when the theme
 * flips), and runs the frame loop while the canvas is on screen and the tab is visible.
 */
function startRoom(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  inputs: RefObject<RoomParticlesProps>,
  reduced: boolean,
): RoomRun {
  const scene: RoomScene = {
    ctx,
    room: { w: 0, h: 0 },
    particles: [],
    colors: readRoomColors(canvas),
  };
  const resize = () => fitCanvas(canvas, ctx, scene.room);
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let raf = 0;
  let visible = true;
  const step = () => {
    stepRoom(scene, inputs.current);
    if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(step);
  };
  const redraw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(([e]) => {
    visible = Boolean(e?.isIntersecting);
    cancelAnimationFrame(raf);
    if (visible) raf = requestAnimationFrame(step);
  });
  io.observe(canvas);
  const onVisibility = () => {
    if (!document.hidden && visible) redraw();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const unsubscribeTheme = subscribeToTheme(() => {
    scene.colors = readRoomColors(canvas);
    redraw();
  });
  raf = requestAnimationFrame(step);

  return {
    redraw,
    stop: () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeTheme();
    },
  };
}

/** Interactive indoor-air visual for the Indoor lab; draws a still frame for reduced motion. */
export function RoomParticles(props: RoomParticlesProps) {
  const { indoor, windowsOpen, purifierOn, sourceOn } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const latest = useLatest<RoomParticlesProps>({ indoor, windowsOpen, purifierOn, sourceOn });
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const run = startRoom(canvas, ctx, latest, reduced);
    redraw.current = run.redraw;
    return () => {
      run.stop();
      redraw.current = null;
    };
  }, [reduced, latest]);

  // Reduced motion: redraw a still frame whenever inputs change.
  useEffect(() => {
    if (reduced) redraw.current?.();
  }, [reduced, indoor, windowsOpen, purifierOn, sourceOn]);

  return <canvas ref={ref} aria-hidden="true" className="block h-full w-full" />;
}
