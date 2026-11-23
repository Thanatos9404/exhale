import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { useLatest } from '@/hooks/useLatest';

/**
 * A cutaway room drawn on canvas. Particle count tracks the modelled indoor PM2.5; an open
 * window lets particles stream in, a purifier pulls them out, and indoor sources puff from the floor.
 */

export interface RoomParticlesProps {
  /** Modelled indoor PM2.5 in µg/m³. */
  indoor: number;
  windowsOpen: boolean;
  purifierOn: boolean;
  sourceOn: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Room {
  w: number;
  h: number;
}

/** About 2.4 drawn particles per µg/m³, clamped so clean air still shows a few and smog stays cheap. */
const PARTICLES_PER_UG = 2.4;
const MIN_PARTICLES = 12;
const MAX_PARTICLES = 900;
/** Purifier intake, measured from the bottom-right corner of the room. */
const INTAKE = { dx: 17, dy: 26, radius: 14 };

function particleAt(x: number, y: number): Particle {
  return { x, y, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4 };
}

/** New particles enter through the open window, rise from an indoor source, or appear anywhere. */
function spawnParticle(s: RoomParticlesProps, { w, h }: Room): Particle {
  if (s.windowsOpen && Math.random() < 0.6) return particleAt(6, h * (0.25 + Math.random() * 0.4));
  if (s.sourceOn && Math.random() < 0.5) {
    return particleAt(w * 0.5 + (Math.random() - 0.5) * 30, h - 14);
  }
  return particleAt(Math.random() * w, Math.random() * h);
}

/** Grows or trims the pool toward the target count, trimming gently so the room drains visibly. */
function balancePool(ps: Particle[], s: RoomParticlesProps, room: Room): void {
  const target = Math.round(
    Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, s.indoor * PARTICLES_PER_UG)),
  );
  while (ps.length < target) ps.push(spawnParticle(s, room));
  if (ps.length > target) ps.splice(0, Math.min(ps.length - target, 12));
}

function drawRoom(
  ctx: CanvasRenderingContext2D,
  css: CSSStyleDeclaration,
  s: RoomParticlesProps,
  { w, h }: Room,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = css.getPropertyValue('--line-strong');
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  // Window on the left wall.
  ctx.fillStyle = css.getPropertyValue(s.windowsOpen ? '--amber' : '--line-strong');
  ctx.globalAlpha = s.windowsOpen ? 0.5 : 0.9;
  ctx.fillRect(0, h * 0.25, 4, h * 0.4);
  // Purifier in the bottom-right corner.
  ctx.globalAlpha = 1;
  ctx.fillStyle = css.getPropertyValue(s.purifierOn ? '--blue' : '--line-strong');
  ctx.fillRect(w - 26, h - 46, 18, 40);
}

/** Brownian drift, plus a draft from the open window and suction toward the purifier intake. */
function moveParticle(p: Particle, s: RoomParticlesProps, { w, h }: Room): void {
  p.vx += (Math.random() - 0.5) * 0.08;
  p.vy += (Math.random() - 0.5) * 0.08;
  if (s.windowsOpen && p.x < w * 0.4) p.vx += 0.02;
  if (s.purifierOn) {
    const dx = w - INTAKE.dx - p.x;
    const dy = h - INTAKE.dy - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.vx += (dx / d) * 0.012;
    p.vy += (dy / d) * 0.012;
  }
  p.vx *= 0.96;
  p.vy *= 0.96;
  p.x = Math.min(w - 2, Math.max(2, p.x + p.vx));
  p.y = Math.min(h - 2, Math.max(2, p.y + p.vy));
}

/** Removes particles that reached the purifier intake, compacting the pool in place. */
function absorbAtIntake(ps: Particle[], { w, h }: Room): void {
  let kept = 0;
  for (const p of ps) {
    if (Math.hypot(w - INTAKE.dx - p.x, h - INTAKE.dy - p.y) >= INTAKE.radius) ps[kept++] = p;
  }
  ps.length = kept;
}

/** Interactive indoor-air visual for the Indoor lab; draws a still frame for reduced motion. */
export function RoomParticles(props: RoomParticlesProps) {
  const { indoor, windowsOpen, purifierOn, sourceOn } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const latest = useLatest<RoomParticlesProps>({ indoor, windowsOpen, purifierOn, sourceOn });
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const room: Room = { w: 0, h: 0 };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      room.w = canvas.clientWidth;
      room.h = canvas.clientHeight;
      canvas.width = room.w * dpr;
      canvas.height = room.h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ps: Particle[] = [];
    let raf = 0;
    let visible = true;
    const step = () => {
      const s = latest.current;
      balancePool(ps, s, room);
      const css = getComputedStyle(canvas);
      drawRoom(ctx, css, s, room);
      ctx.fillStyle = css.getPropertyValue('--fg');
      ctx.globalAlpha = 0.55;
      for (const p of ps) {
        moveParticle(p, s, room);
        ctx.fillRect(p.x, p.y, 1.6, 1.6);
      }
      if (s.purifierOn) absorbAtIntake(ps, room);
      ctx.globalAlpha = 1;
      if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(step);
    });
    io.observe(canvas);
    redraw.current = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      redraw.current = null;
    };
  }, [reduced, latest]);

  // Reduced motion: redraw a still frame whenever inputs change.
  useEffect(() => {
    if (reduced) redraw.current?.();
  }, [reduced, indoor, windowsOpen, purifierOn, sourceOn]);

  return <canvas ref={ref} aria-hidden="true" className="block h-full w-full" />;
}
