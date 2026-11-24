/**
 * Coalesces a burst of updates into one per animation frame, keeping only the latest value, so
 * a fast stream costs at most one render per painted frame.
 */

/** A frame-batched sink for values of one kind. */
export interface FrameBatch<T> {
  /** Offers a value; the latest one offered is applied on the next frame. */
  push: (value: T) => void;
  /** Drops any value that is still waiting and the frame that would apply it. */
  cancel: () => void;
}

/** Batches calls to `apply` so that it runs at most once per animation frame. */
export function frameBatch<T>(apply: (value: T) => void): FrameBatch<T> {
  let frame = 0;
  let waiting: { value: T } | null = null;

  const flush = () => {
    frame = 0;
    const next = waiting;
    waiting = null;
    if (next) apply(next.value);
  };

  return {
    push(value) {
      waiting = { value };
      if (frame === 0) frame = requestAnimationFrame(flush);
    },
    cancel() {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      waiting = null;
    },
  };
}
