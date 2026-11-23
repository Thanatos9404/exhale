// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { COOLDOWN_MS, QUOTA_COOLDOWN_MS } from './config';
import { breaker, createBreaker, outOfQuota } from './breaker';
import { candidates, setClient, type GenAiLike, type Slot } from './candidates';
import { isQuotaError } from './errors';

const pair = { key: 'k1', model: 'm' };
const other = { key: 'k2', model: 'm' };

describe('circuit breaker', () => {
  it('benches a failing pair for the cooldown, leaving other pairs alone', () => {
    const b = createBreaker();
    b.trip(pair, new Error('503 overloaded'), 0);
    expect(b.isCooling(pair, COOLDOWN_MS - 1)).toBe(true);
    expect(b.isCooling(pair, COOLDOWN_MS)).toBe(false);
    expect(b.isCooling(other, 0)).toBe(false);
    expect(b.outOfQuota(pair, 0)).toBe(false);
  });

  it('benches a pair out of quota for longer and marks it out of quota', () => {
    const b = createBreaker();
    b.trip(pair, new Error('429 RESOURCE_EXHAUSTED'), 0);
    expect(b.outOfQuota(pair, QUOTA_COOLDOWN_MS - 1)).toBe(true);
    expect(b.isCooling(pair, QUOTA_COOLDOWN_MS - 1)).toBe(true);
    expect(b.outOfQuota(pair, QUOTA_COOLDOWN_MS)).toBe(false);
  });

  it('forgets everything on reset', () => {
    const b = createBreaker();
    b.trip(pair, new Error('quota'), 0);
    b.reset();
    expect(b.isCooling(pair, 1)).toBe(false);
    expect(b.outOfQuota(pair, 1)).toBe(false);
  });

  it('classifies quota errors from messages and plain strings', () => {
    expect(isQuotaError(new Error('You exceeded your current quota'))).toBe(true);
    expect(isQuotaError('429')).toBe(true);
    expect(isQuotaError(new Error('503 high demand'))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});

describe('candidate order with the shared breaker', () => {
  afterEach(() => setClient(undefined));
  const slots: Slot[] = [
    { key: 'k1', client: {} as GenAiLike },
    { key: 'k2', client: {} as GenAiLike },
  ];

  it('skips pairs that are cooling down', () => {
    const all = candidates(slots);
    const first = all[0]!;
    breaker.trip(first, new Error('503'));
    const ready = candidates(slots);
    expect(ready).toHaveLength(all.length - 1);
    expect(ready.map((c) => `${c.key}/${c.model}`)).not.toContain(`${first.key}/${first.model}`);
  });

  it('tries every pair anyway when all of them are cooling down', () => {
    const all = candidates(slots);
    for (const c of all) breaker.trip(c, new Error('503'));
    expect(candidates(slots)).toHaveLength(all.length);
  });

  it('exposes quota state through outOfQuota and clears it with setClient', () => {
    breaker.trip(pair, new Error('quota exhausted'));
    expect(outOfQuota(pair)).toBe(true);
    setClient(undefined);
    expect(outOfQuota(pair)).toBe(false);
  });
});
