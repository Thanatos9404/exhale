/**
 * The particle orb's frame loop. It eases the particles apart while the orb is active, spins the
 * sphere, and stops asking for frames once the orb is inactive and has settled.
 */

/** Spread below this is treated as fully settled. */
const SETTLED = 0.001;
/** Frame gaps are capped so a long pause does not make the orb jump, in milliseconds. */
const MAX_FRAME_MS = 64;

/** What one frame needs to know about the orb's motion. */
export interface OrbMotion {
  /** Rotation about the vertical axis, in radians. */
  angle: number;
  /** How far the particles are pushed apart, from 0 (at rest) to 1 (active). */
  spread: number;
  /** The frame's timestamp, in milliseconds. */
  now: number;
}

interface OrbLoopOptions {
  draw: (motion: OrbMotion) => void;
  /** Read every frame, so the loop follows the latest prop without restarting. */
  isActive: () => boolean;
  /** Reduced motion: each wake draws a single still frame. */
  reduced: boolean;
}

/** Controls for a running orb. */
export interface OrbLoop {
  /** Draws a frame, then keeps animating for as long as something is moving. */
  wake: () => void;
  /** Pauses the loop while the canvas is offscreen and wakes it on return. */
  setVisible: (visible: boolean) => void;
  stop: () => void;
}

/** Builds the loop. Nothing is drawn until `wake` is called. */
export function createOrbLoop({ draw, isActive, reduced }: OrbLoopOptions): OrbLoop {
  let angle = 0;
  let spread = 0;
  let raf = 0;
  let visible = true;
  let last = performance.now();

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(MAX_FRAME_MS, now - last) / 1000;
    last = now;
    const target = isActive() ? 1 : 0;
    spread += (target - spread) * Math.min(1, dt * 6);
    if (Math.abs(target - spread) < SETTLED) spread = target;
    angle += dt * (0.5 + spread * 2.2);
    draw({ angle, spread, now });
    const moving = target === 1 || spread > 0;
    if (moving && !reduced) wake();
  };

  function wake() {
    if (raf === 0 && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  return {
    wake,
    stop,
    setVisible(next) {
      visible = next;
      if (next) wake();
      else stop();
    },
  };
}
