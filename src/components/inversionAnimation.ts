/**
 * The inversion diagram's geometry and motion: where the lid and the smoke sources sit, and the
 * GSAP loops that make the smoke rise, flatten under the lid and drift. The loops pause while
 * the diagram is offscreen or the tab is hidden.
 */
import { useEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useLatest } from '@/hooks/useLatest';
import { useInView } from '@/hooks/useThemeColors';

gsap.registerPlugin(useGSAP);

/** Height of the diagram's viewBox. */
export const H = 220;
/** The y coordinate of street level. */
export const GROUND = 188;

/** Maps mixing height (m) onto the diagram's y axis on a log scale, so 30 m and 3 km both fit. */
export function lidToY(blh: number): number {
  const t = Math.log10(Math.max(10, Math.min(3000, blh)) / 10) / Math.log10(300);
  return Math.round(GROUND - 22 - t * (GROUND - 52));
}

/** Smoke sources: two chimneys and a car exhaust. */
const SOURCES = [
  { x: 74, y: 146 },
  { x: 248, y: 142 },
  { x: 330, y: GROUND - 8 },
] as const;
/** How many smoke puffs the diagram draws. */
export const PUFF_COUNT = 15;

/** Puffs cycle through the sources so each one gets an even share of the smoke. */
export function sourceFor(i: number) {
  return SOURCES[i % SOURCES.length] ?? SOURCES[0];
}

interface Motion {
  /** The lid's y coordinate in the diagram. */
  lid: number;
  /** Wind speed in km/h; it pushes the spreading smoke sideways. */
  wind: number;
  reduced: boolean;
}

/**
 * One puff: rise from its source, flatten under the lid, drift and fade. Returns the looping
 * timeline, or null for reduced motion, where the puff is placed once and stays still.
 */
function animatePuff(
  p: SVGCircleElement,
  i: number,
  { lid, wind, reduced }: Motion,
): gsap.core.Timeline | null {
  const src = sourceFor(i);
  const spread = (i % 2 ? 1 : -1) * (40 + ((i * 13) % 60));
  const ceiling = lid + 6 + (i % 3) * 5;
  if (reduced) {
    gsap.set(p, { attr: { cx: src.x + spread * 0.8, cy: ceiling + 4, r: 9 }, opacity: 0.45 });
    return null;
  }
  return gsap
    .timeline({ repeat: -1, delay: (i * 0.45) % 5 })
    .set(p, { attr: { cx: src.x, cy: src.y, r: 3 }, opacity: 0 })
    .to(p, { opacity: 0.6, duration: 0.4, ease: 'none' })
    .to(
      p,
      {
        attr: { cy: ceiling, r: 7 },
        duration: 1.6 + (src.y - ceiling) / 120,
        ease: 'power1.out',
      },
      '<',
    )
    .to(p, {
      attr: { cx: src.x + spread + wind * 2, r: 12 },
      opacity: 0.35,
      duration: 2.4,
      ease: 'sine.out',
    })
    .to(p, { opacity: 0, duration: 0.8, ease: 'none' });
}

/**
 * Animates the smoke puffs and the marching lid line inside the diagram's svg. Every loop is
 * paused while the svg is offscreen or the tab is hidden, so an unseen diagram costs no frames.
 */
export function useInversionAnimation(root: RefObject<SVGSVGElement | null>, motion: Motion) {
  const { lid, wind, reduced } = motion;
  const inView = useInView(root);
  const inViewNow = useLatest(inView);
  const loops = useRef<gsap.core.Animation[]>([]);

  useGSAP(
    () => {
      const puffs = gsap.utils.toArray<SVGCircleElement>('.puff', root.current);
      const running: gsap.core.Animation[] = [];
      puffs.forEach((p, i) => {
        const puff = animatePuff(p, i, { lid, wind, reduced });
        if (puff) running.push(puff);
      });
      running.push(
        gsap.to('.lid-line', {
          strokeDashoffset: -24,
          duration: 2,
          repeat: reduced ? 0 : -1,
          ease: 'none',
        }),
      );
      // A diagram rebuilt while out of view starts paused, like the loops it replaces.
      if (!inViewNow.current) {
        for (const loop of running) loop.pause();
      }
      loops.current = running;
      return () => {
        loops.current = [];
      };
    },
    { scope: root, dependencies: [lid, reduced, wind], revertOnUpdate: true },
  );

  useEffect(() => {
    for (const loop of loops.current) loop.paused(!inView);
  }, [inView]);
}
