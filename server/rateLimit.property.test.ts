// @vitest-environment node
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

/**
 * Property tests for the sliding-window limiter. Arrival times are arbitrary but never run
 * backwards, like the clock the limiter reads in production.
 */

const RUNS = { numRuns: 200 };

const configArb = fc.record({
  limit: fc.integer({ min: 1, max: 8 }),
  windowMs: fc.integer({ min: 1, max: 60_000 }),
});

/** Gaps between requests: bursts in the same millisecond, steady traffic, and long silences. */
const gapsArb = (windowMs: number) =>
  fc.array(
    fc.oneof(
      fc.constant(0),
      fc.integer({ min: 0, max: Math.max(1, Math.floor(windowMs / 4)) }),
      fc.integer({ min: 0, max: windowMs * 2 }),
    ),
    { minLength: 1, maxLength: 80 },
  );

/** Absolute arrival times from the gaps between them, starting at an arbitrary instant. */
function arrivals(start: number, gaps: readonly number[]): number[] {
  let now = start;
  return gaps.map((gap) => (now += gap));
}

const trafficArb = configArb.chain((config) =>
  fc.record({
    config: fc.constant(config),
    start: fc.integer({ min: 0, max: 2_000_000_000_000 }),
    gaps: gapsArb(config.windowMs),
  }),
);

describe('rate limiter properties', () => {
  it('never allows more than `limit` requests in any window, for arbitrary arrival times', () => {
    fc.assert(
      fc.property(trafficArb, ({ config, start, gaps }) => {
        const limiter = createRateLimiter(config);
        const allowed = arrivals(start, gaps).filter((t) => limiter.check('client', t).ok);
        for (const t of allowed) {
          // The window that ends at an allowed request holds the most recent traffic.
          const inWindow = allowed.filter((a) => a > t - config.windowMs && a <= t);
          expect(inWindow.length).toBeLessThanOrEqual(config.limit);
        }
      }),
      RUNS,
    );
  });

  it('never blocks a request while the window still has room', () => {
    fc.assert(
      fc.property(trafficArb, ({ config, start, gaps }) => {
        const limiter = createRateLimiter(config);
        const allowed: number[] = [];
        for (const t of arrivals(start, gaps)) {
          const recent = allowed.filter((a) => a > t - config.windowMs).length;
          const result = limiter.check('client', t);
          expect(result.ok).toBe(recent < config.limit);
          if (result.ok) allowed.push(t);
        }
      }),
      RUNS,
    );
  });

  it('reports how many requests are left, and a retry hint only when blocked', () => {
    fc.assert(
      fc.property(trafficArb, ({ config, start, gaps }) => {
        const limiter = createRateLimiter(config);
        const allowed: number[] = [];
        for (const t of arrivals(start, gaps)) {
          const result = limiter.check('client', t);
          if (result.ok) allowed.push(t);
          const used = allowed.filter((a) => a > t - config.windowMs).length;
          expect(result.remaining).toBe(result.ok ? config.limit - used : 0);
          expect(result.remaining).toBeGreaterThanOrEqual(0);
          if (result.ok) expect(result.retryAfterSec).toBe(0);
          else expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
        }
      }),
      RUNS,
    );
  });

  it('gives an honest retry hint: waiting that long gets the next request through', () => {
    fc.assert(
      fc.property(trafficArb, ({ config, start, gaps }) => {
        const limiter = createRateLimiter(config);
        for (const t of arrivals(start, gaps)) {
          const result = limiter.check('client', t);
          if (result.ok) continue;
          // The hint is rounded up to whole seconds, never more than a second past the window.
          expect(result.retryAfterSec * 1000).toBeLessThan(config.windowMs + 1000);
          // With no other traffic in between, the client that waits is let in.
          expect(limiter.check('client', t + result.retryAfterSec * 1000).ok).toBe(true);
          return;
        }
      }),
      RUNS,
    );
  });

  it('counts every client separately', () => {
    fc.assert(
      fc.property(
        trafficArb,
        fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 80 }),
        ({ config, start, gaps }, keys) => {
          const shared = createRateLimiter(config);
          const alone = {
            a: createRateLimiter(config),
            b: createRateLimiter(config),
            c: createRateLimiter(config),
          };
          arrivals(start, gaps).forEach((t, i) => {
            const key = keys[i % keys.length]!;
            expect(shared.check(key, t)).toEqual(alone[key].check(key, t));
          });
        },
      ),
      RUNS,
    );
  });

  it('forgets everything on reset', () => {
    fc.assert(
      fc.property(trafficArb, ({ config, start, gaps }) => {
        const limiter = createRateLimiter(config);
        const times = arrivals(start, gaps);
        for (const t of times) limiter.check('client', t);
        limiter.reset();
        const last = times.at(-1) ?? start;
        expect(limiter.check('client', last)).toEqual({
          ok: true,
          remaining: config.limit - 1,
          retryAfterSec: 0,
        });
      }),
      RUNS,
    );
  });
});
