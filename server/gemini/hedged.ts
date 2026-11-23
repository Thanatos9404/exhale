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
}

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
    function launch() {
      if (settled) return;
      if (next >= items.length) {
        if (running > 0) return;
        // Overload spikes are short: after a backoff, sweep the list once more before giving up.
        if (round < (opts.rounds ?? 1)) {
          round++;
          next = 0;
          hedgeTimer = setTimeout(launch, opts.backoffMs ?? 1_500);
          return;
        }
        finish(null);
        return;
      }
      const item = defined(items[next++], 'hedged item');
      const ctrl = new AbortController();
      controllers.push(ctrl);
      running++;
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, opts.hedgeAfterMs);
      const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(opts.perAttemptMs)]);
      run(item, signal).then(finish, () => {
        running--;
        launch();
      });
    }
    launch();
  });
}
