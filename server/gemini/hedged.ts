/**
 * The hedged fan-out runner: races a list of candidates with staggered starts and keeps the first
 * valid answer. It knows nothing about Gemini; the JSON client supplies the candidates.
 */
import { defined } from '../../src/lib/assert.js';

/** Timing for one hedged run. */
export interface HedgeOptions {
  /** Start the next item in parallel when the running ones have not answered by then. */
  hedgeAfterMs: number;
  /** Give up and resolve null after this, whatever is still running. */
  deadlineMs: number;
  /** Abort a single attempt after this. */
  perAttemptMs: number;
  /** How many times to sweep the list when every item fails. Defaults to 1. */
  rounds?: number;
  /** Pause between sweeps. Defaults to 1.5 s. */
  backoffMs?: number;
  /**
   * True for a failure that no other item can avoid (a spent budget, say). Nothing more is
   * started; the run ends with null once the attempts already in flight have settled.
   */
  isFatal?: (err: unknown) => boolean;
}

/** Pause between sweeps when the caller names none: long enough for an overload spike to pass. */
const DEFAULT_BACKOFF_MS = 1_500;

/**
 * Hedged fan-out: start the first candidate; if it has not answered within `hedgeAfterMs`, or it
 * fails, start the next one too, and take whichever valid answer lands first. Losers are aborted.
 * This keeps latency near the fastest healthy option when the preferred one is overloaded.
 */
export function hedged<C, R>(
  items: readonly C[],
  run: (item: C, signal: AbortSignal) => Promise<R>,
  opts: HedgeOptions,
): Promise<R | null> {
  return new Promise((resolve) => {
    const controllers: AbortController[] = [];
    let next = 0;
    let running = 0;
    let round = 1;
    let settled = false;
    let halted = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => finish(null), opts.deadlineMs);
    function finish(value: R | null) {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadline);
      controllers.forEach((c) => c.abort());
      resolve(value);
    }
    /** Every item was tried, or a fatal failure stopped the run: sweep again or give up. */
    function exhausted() {
      if (running > 0) return;
      // Overload spikes are short: after a backoff, sweep the list once more before giving up.
      if (!halted && round < (opts.rounds ?? 1)) {
        round++;
        next = 0;
        hedgeTimer = setTimeout(launch, opts.backoffMs ?? DEFAULT_BACKOFF_MS);
        return;
      }
      finish(null);
    }
    function launch() {
      if (settled) return;
      if (halted || next >= items.length) {
        exhausted();
        return;
      }
      const item = defined(items[next++], 'hedged item');
      const ctrl = new AbortController();
      controllers.push(ctrl);
      running++;
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, opts.hedgeAfterMs);
      const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(opts.perAttemptMs)]);
      run(item, signal).then(finish, (err: unknown) => {
        running--;
        if (opts.isFatal?.(err)) halted = true;
        launch();
      });
    }
    launch();
  });
}
