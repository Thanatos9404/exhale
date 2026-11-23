import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { useLatest } from '@/hooks/useLatest';

/**
 * A tiny 3D particle sphere drawn on a 2D canvas: the assistant's mark.
 * Points sit on a Fibonacci sphere; hovering ("active") spins it faster and lets the particles
 * drift apart like breath leaving a mask. Paused offscreen, in background tabs and for
 * reduced-motion users (who get a still frame).
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
  const activeRef = useLatest(active);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const n = Math.min(420, Math.round(size * size * 0.55));
    const pts = Array.from({ length: n }, (_, i) => {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = i * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(t) * r, y, z: Math.sin(t) * r, seed: Math.random() * Math.PI * 2 };
    });

    let angle = 0;
    let spread = 0;
    let raf = 0;
    let visible = true;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const target = activeRef.current ? 1 : 0;
      spread += (target - spread) * Math.min(1, dt * 6);
      angle += dt * (0.5 + spread * 2.2);
      const color = getComputedStyle(canvas).color;
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
      if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [size, reduced, activeRef]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
