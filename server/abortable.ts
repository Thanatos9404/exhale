/**
 * Abort plumbing for provider calls. A provider SDK is asked to stop through an AbortSignal, but
 * the handler must not depend on the SDK obeying: these helpers stop waiting the moment the signal
 * fires, whatever the upstream call is doing.
 */

/** The signal's reason as an Error, so callers can log and classify it like any failure. */
function reasonOf(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error('aborted');
}

/** Settles with `promise`, or rejects with the signal's reason as soon as it aborts. */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(reasonOf(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(reasonOf(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Relays `source` until it ends or the signal aborts; an abort throws the signal's reason. */
export async function* untilAborted<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T, void> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      const step = await raceAbort(iterator.next(), signal);
      if (step.done) return;
      yield step.value;
    }
  } finally {
    // Tell the source to stop, but never wait: a stuck source may not answer at all.
    void Promise.resolve(iterator.return?.()).catch(() => undefined);
  }
}

/** A timed abort signal and the function that releases its timer. */
export interface TimedAbort {
  signal: AbortSignal;
  /** Clears the timer and the parent listener once the guarded work has ended. */
  done(): void;
}

/**
 * A signal that aborts after `ms`, or as soon as `parent` aborts. Unlike AbortSignal.timeout its
 * timer can be released when the work ends early, and it follows the test clock.
 */
export function abortAfter(ms: number, message: string, parent?: AbortSignal): TimedAbort {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(message)), ms);
  const onParent = () => ctrl.abort(parent ? reasonOf(parent) : undefined);
  if (parent?.aborted) onParent();
  else parent?.addEventListener('abort', onParent, { once: true });
  return {
    signal: ctrl.signal,
    done() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParent);
    },
  };
}
