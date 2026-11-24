/**
 * The assistant's mark: a tiny 3D particle sphere drawn on a 2D canvas, which spins up and
 * breathes out while active and comes to rest (and stops drawing) when it is not.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { useLatest } from '@/hooks/useLatest';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { subscribeToTheme } from '@/hooks/useThemeColors';
import { createOrbLoop, type OrbLoop, type OrbMotion } from './orbLoop';

interface OrbPoint {
  x: number;
  y: number;
  z: number;
  seed: number;
}

/** Points on a Fibonacci sphere; the count grows with the drawn size. */
function orbPoints(size: number): OrbPoint[] {
  const n = Math.min(420, Math.round(size * size * 0.55));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = i * Math.PI * (3 - Math.sqrt(5));
    return { x: Math.cos(t) * r, y, z: Math.sin(t) * r, seed: Math.random() * Math.PI * 2 };
  });
}

interface OrbFrame extends OrbMotion {
  size: number;
  color: string;
}

/** Draws one frame: the sphere rotated, tilted, pushed apart by `spread` and depth-shaded. */
function drawOrb(ctx: CanvasRenderingContext2D, pts: OrbPoint[], frame: OrbFrame): void {
  const { size, angle, spread, now, color } = frame;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  const c = size / 2;
  const R = size * 0.36;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const tilt = 0.45;
  for (const p of pts) {
    const x1 = p.x * cosA - p.z * sinA;
    const z1 = p.x * sinA + p.z * cosA;
    const y1 = p.y * Math.cos(tilt) - z1 * Math.sin(tilt);
    const z2 = p.y * Math.sin(tilt) + z1 * Math.cos(tilt);
    const push = 1 + spread * (0.18 + 0.22 * Math.sin(p.seed + now / 400));
    const persp = 1.6 / (2.6 - z2);
    const px = c + x1 * R * push * persp;
    const py = c + y1 * R * push * persp;
    const depth = (z2 + 1) / 2;
    ctx.globalAlpha = 0.18 + depth * 0.82;
    const s = Math.max(0.6, (size / 48) * (0.7 + depth));
    ctx.fillRect(px - s / 2, py - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

/**
 * Runs the orb on the canvas. The loop idles once the orb has settled, pauses offscreen and in
 * hidden tabs, and draws a single still frame for reduced motion. The colour is read from CSS
 * once, and again when the theme flips, never per frame.
 */
function useOrbLoop(ref: RefObject<HTMLCanvasElement | null>, size: number, active: boolean) {
  const activeRef = useLatest(active);
  const reduced = usePrefersReducedMotion();
  const loopRef = useRef<OrbLoop | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const pts = orbPoints(size);
    let color = getComputedStyle(canvas).color;
    const loop = createOrbLoop({
      draw: (motion) => drawOrb(ctx, pts, { ...motion, size, color }),
      isActive: () => activeRef.current,
      reduced,
    });
    loopRef.current = loop;

    const io = new IntersectionObserver(([e]) => loop.setVisible(Boolean(e?.isIntersecting)));
    io.observe(canvas);
    document.addEventListener('visibilitychange', loop.wake);
    const unsubscribeTheme = subscribeToTheme(() => {
      color = getComputedStyle(canvas).color;
      loop.wake();
    });
    loop.wake();
    return () => {
      loop.stop();
      loopRef.current = null;
      io.disconnect();
      document.removeEventListener('visibilitychange', loop.wake);
      unsubscribeTheme();
    };
  }, [ref, size, reduced, activeRef]);

  // An idle orb has no frame pending, so a change of `active` has to start one.
  useEffect(() => {
    loopRef.current?.wake();
  }, [active]);
}

/**
 * A tiny 3D particle sphere drawn on a 2D canvas: the assistant's mark.
 * Points sit on a Fibonacci sphere; hovering ("active") spins it faster and lets the particles
 * drift apart like breath leaving a mask. It rests, without drawing, once it is inactive and has
 * settled; it is also paused offscreen, in background tabs and for reduced-motion users (who get
 * a still frame).
 */
export function ParticleOrb({
  size = 18,
  active = false,
  className,
}: {
  size?: number;
  active?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useOrbLoop(ref, size, active);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
