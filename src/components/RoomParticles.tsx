import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * A cutaway room drawn on canvas. Particle count tracks the modelled indoor PM2.5; an open
 * window lets particles stream in, a purifier pulls them out, and indoor sources puff from the floor.
 */
export function RoomParticles({
  indoor,
  windowsOpen,
  purifierOn,
  sourceOn,
}: {
  indoor: number;
  windowsOpen: boolean;
  purifierOn: boolean;
  sourceOn: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const state = useRef({ indoor, windowsOpen, purifierOn, sourceOn });
  state.current = { indoor, windowsOpen, purifierOn, sourceOn };
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type P = { x: number; y: number; vx: number; vy: number };
    const ps: P[] = [];
    const spawn = (x = Math.random() * w, y = Math.random() * h): P => ({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
    });

    let raf = 0;
    let visible = true;
    const step = () => {
      const s = state.current;
      const target = Math.round(Math.min(900, Math.max(12, s.indoor * 2.4)));
      while (ps.length < target)
        ps.push(
          s.windowsOpen && Math.random() < 0.6
            ? spawn(6, h * (0.25 + Math.random() * 0.4))
            : s.sourceOn && Math.random() < 0.5
              ? spawn(w * 0.5 + (Math.random() - 0.5) * 30, h - 14)
              : spawn(),
        );
      if (ps.length > target) ps.splice(0, Math.min(ps.length - target, 12));

      const style = getComputedStyle(canvas);
      ctx.clearRect(0, 0, w, h);
      // room outline
      ctx.strokeStyle = style.getPropertyValue('--line-strong');
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
      // window
      ctx.fillStyle = s.windowsOpen
        ? style.getPropertyValue('--amber')
        : style.getPropertyValue('--line-strong');
      ctx.globalAlpha = s.windowsOpen ? 0.5 : 0.9;
      ctx.fillRect(0, h * 0.25, 4, h * 0.4);
      // purifier
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.purifierOn
        ? style.getPropertyValue('--blue')
        : style.getPropertyValue('--line-strong');
      ctx.fillRect(w - 26, h - 46, 18, 40);

      ctx.fillStyle = style.getPropertyValue('--fg');
      for (const p of ps) {
        p.vx += (Math.random() - 0.5) * 0.08;
        p.vy += (Math.random() - 0.5) * 0.08;
        if (s.windowsOpen && p.x < w * 0.4) p.vx += 0.02;
        if (s.purifierOn) {
          const dx = w - 17 - p.x;
          const dy = h - 26 - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 0.012;
          p.vy += (dy / d) * 0.012;
        }
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.x = Math.min(w - 2, Math.max(2, p.x + p.vx));
        p.y = Math.min(h - 2, Math.max(2, p.y + p.vy));
        ctx.globalAlpha = 0.55;
        ctx.fillRect(p.x, p.y, 1.6, 1.6);
      }
      if (s.purifierOn) {
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i]!;
          if (Math.hypot(w - 17 - p.x, h - 26 - p.y) < 14) ps.splice(i, 1);
        }
      }
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
    };
  }, [reduced]);

  // Reduced motion: redraw a still frame whenever inputs change.
  useEffect(() => {
    if (!reduced) return;
    redraw.current();
  }, [reduced, indoor, windowsOpen, purifierOn, sourceOn]);

  return <canvas ref={ref} aria-hidden="true" className="block h-full w-full" />;
}
