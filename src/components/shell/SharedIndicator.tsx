/**
 * A decorative marker that slides between the places it is rendered. When one instance unmounts
 * and another with the same id mounts in the same commit, the new one animates from the old
 * one's box with a spring. The move is a transform-only FLIP on the Web Animations API, so the
 * first paint needs no animation library.
 */
import { useLayoutEffect, useRef } from 'react';

/** The box each id last occupied, kept only until the commit that removed it has finished. */
const departed = new Map<string, DOMRect>();

/**
 * The spring `{ duration: 0.35, bounce: 0.12 }`: a damping ratio of 1 - bounce, and the natural
 * frequency (rad/s) at which the motion has decayed to a thousandth by the end of the duration.
 */
const DURATION_MS = 350;
const DAMPING_RATIO = 0.88;
const FREQUENCY = 24.4;
/** Keyframes sampled along the spring; the browser interpolates linearly between them. */
const STEPS = 24;

/** Progress of the spring, from 0 towards 1, `seconds` after release. */
export function springProgress(seconds: number): number {
  const decay = DAMPING_RATIO * FREQUENCY;
  const damped = FREQUENCY * Math.sqrt(1 - DAMPING_RATIO ** 2);
  const wave = Math.cos(damped * seconds) + (decay / damped) * Math.sin(damped * seconds);
  return 1 - Math.exp(-decay * seconds) * wave;
}

/** Transforms that carry a box at `to` back to `from` and release it along the spring. */
export function slideKeyframes(from: DOMRect, to: DOMRect): Keyframe[] {
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width - 1;
  const sy = from.height / to.height - 1;
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const left = i === STEPS ? 0 : 1 - springProgress(((i / STEPS) * DURATION_MS) / 1000);
    return {
      transform: `translate(${dx * left}px, ${dy * left}px) scale(${1 + sx * left}, ${1 + sy * left})`,
    };
  });
}

const hasBox = (rect: DOMRect) => rect.width > 0 && rect.height > 0;
const sameBox = (a: DOMRect, b: DOMRect) =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

interface SharedIndicatorProps {
  /** Instances with the same id hand the marker on to each other. */
  id: string;
  /** False for reduced motion: the marker jumps to its new place. */
  animate: boolean;
  /** Must include `origin-top-left`, which the slide's transform is measured from. */
  className: string;
}

/** One sliding marker, such as the tab bar's hover pill or active underline. */
export function SharedIndicator({ id, animate, className }: SharedIndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = departed.get(id);
    departed.delete(id);
    if (from && animate && 'animate' in el) {
      const to = el.getBoundingClientRect();
      if (hasBox(from) && hasBox(to) && !sameBox(from, to)) {
        el.animate(slideKeyframes(from, to), { duration: DURATION_MS, easing: 'linear' });
      }
    }
    return () => {
      // Measured while still attached, so a marker caught mid-slide hands on where it really is.
      const rect = el.getBoundingClientRect();
      departed.set(id, rect);
      // A successor mounts in this same commit; after it, nothing is left to slide from.
      queueMicrotask(() => {
        if (departed.get(id) === rect) departed.delete(id);
      });
    };
  }, [id, animate]);

  return <span ref={ref} aria-hidden="true" className={className} />;
}
