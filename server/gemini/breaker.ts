/**
 * Circuit breaker for key × model pairs. A pair that fails with a retryable error is skipped for a
 * few minutes so later requests go straight to a healthy pair. A quota error skips it for longer
 * and marks it out of quota, so the runners do not spend a request finding that out again.
 * State lives in instance memory, which is enough: a cold instance simply learns again.
 */
import { COOLDOWN_MS, QUOTA_COOLDOWN_MS } from './config.js';
import { isQuotaError } from './errors.js';

/** One key × model pair. `key` is a secret-free label such as "k1", never the key itself. */
export interface PairRef {
  key: string;
  model: string;
}

/** Stable, secret-free label for logs and breaker state, e.g. "k1/gemini-3.6-flash". */
export const slotId = (pair: PairRef): string => `${pair.key}/${pair.model}`;

export interface Breaker {
  /** Benches a pair after a retryable failure; a quota error benches it for longer. */
  trip(pair: PairRef, err?: unknown, now?: number): void;
  /** True while a pair is benched after a failure. */
  isCooling(pair: PairRef, now?: number): boolean;
  /** True while a pair is known to be out of quota. */
  outOfQuota(pair: PairRef, now?: number): boolean;
  /** Forgets every failure (test hook, and used when the client set changes). */
  reset(): void;
}

/** Creates an independent breaker. The app uses the shared `breaker` below. */
export function createBreaker(
  cooldownMs = COOLDOWN_MS,
  quotaCooldownMs = QUOTA_COOLDOWN_MS,
): Breaker {
  const coolingUntil = new Map<string, number>();
  const quotaUntil = new Map<string, number>();
  return {
    trip(pair, err, now = Date.now()) {
      const quota = isQuotaError(err);
      if (quota) quotaUntil.set(slotId(pair), now + quotaCooldownMs);
      coolingUntil.set(slotId(pair), now + (quota ? quotaCooldownMs : cooldownMs));
    },
    isCooling: (pair, now = Date.now()) => (coolingUntil.get(slotId(pair)) ?? 0) > now,
    outOfQuota: (pair, now = Date.now()) => (quotaUntil.get(slotId(pair)) ?? 0) > now,
    reset() {
      coolingUntil.clear();
      quotaUntil.clear();
    },
  };
}

/** The breaker shared by the JSON and streaming runners in this instance. */
export const breaker = createBreaker();

/** True while a key × model pair is known to be out of quota; skipping it saves requests. */
export function outOfQuota(pair: PairRef, now = Date.now()): boolean {
  return breaker.outOfQuota(pair, now);
}
