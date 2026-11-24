/**
 * A per-instance budget for Gemini calls. One request can fan out across every key, model and
 * retry round, and many requests can do so at once; the budget caps what one instance may send
 * upstream however much traffic or failure it sees. When it is spent the callers skip Gemini and
 * go straight to the next provider.
 */
import * as log from '../log.js';
import { createRateLimiter } from '../rateLimit.js';

/**
 * Upstream calls allowed per minute per instance. One a second, sustained, is far above what real
 * visitors cause (a healthy plan or answer is one call), while a retry storm or a scripted burst
 * (4 models × every key × 3 rounds per request) reaches it within seconds.
 */
export const GEMINI_CALLS_PER_MINUTE = 60;

const BUDGET_WINDOW_MS = 60_000;

const budget = createRateLimiter({
  limit: GEMINI_CALLS_PER_MINUTE,
  windowMs: BUDGET_WINDOW_MS,
  maxKeys: 1,
});

/** Thrown by an attempt that could not start because the instance's budget is spent. */
export class GeminiBudgetError extends Error {
  constructor() {
    super('Gemini call budget spent for this minute');
    this.name = 'GeminiBudgetError';
  }
}

/** Records one upstream call. False when the budget is spent: the caller must not call Gemini. */
export function takeGeminiCall(now?: number): boolean {
  const ok = budget.check('gemini', now).ok;
  if (!ok) log.warn('Gemini call budget reached for this minute');
  return ok;
}

/** Restores the full budget (test hook, and used when the client set changes). */
export function resetGeminiBudget(): void {
  budget.reset();
}
