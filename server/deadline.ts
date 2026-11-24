/**
 * One time budget per request. A handler starts a deadline when the request arrives and hands it
 * to every stage (air data, Gemini, Claude). Each stage may use its own budget or the time left,
 * whichever is smaller, so the stages can never add up past the function limit.
 */

/**
 * The function may run for 60 s (vercel.json). 50 s leaves 10 s for a cold start, body parsing,
 * the planner and flushing the response, so the handler answers instead of being killed.
 */
export const REQUEST_DEADLINE_MS = 50_000;

/** No provider returns anything useful in less than this; a stage with less left is skipped. */
export const MIN_STAGE_MS = 2_000;

/** The time budget of one request. */
export interface Deadline {
  /** Milliseconds until the request must be answered; 0 once that moment has passed. */
  remaining(): number;
  /** A stage's allowance: its own budget or the time left, whichever is smaller. */
  budget(ownMs: number): number;
}

/** Starts the clock for one request. `clock` is injectable for tests. */
export function startDeadline(
  totalMs = REQUEST_DEADLINE_MS,
  clock: () => number = () => Date.now(),
): Deadline {
  const endsAt = clock() + totalMs;
  const remaining = () => Math.max(0, endsAt - clock());
  return { remaining, budget: (ownMs) => Math.min(ownMs, remaining()) };
}

/** A stage's allowance when the caller may not have a request deadline (tests, scripts). */
export function stageBudget(deadline: Deadline | undefined, ownMs: number): number {
  return deadline ? deadline.budget(ownMs) : ownMs;
}

/** Thrown by `within` when a stage used up its allowance. */
export class DeadlineError extends Error {
  constructor() {
    super('stage deadline reached');
    this.name = 'DeadlineError';
  }
}

/** Settles with `promise`, or rejects with a DeadlineError once `ms` have passed. */
export function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError()), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
