// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortAfter, raceAbort, untilAborted } from './abortable';
import {
  DeadlineError,
  MIN_STAGE_MS,
  REQUEST_DEADLINE_MS,
  stageBudget,
  startDeadline,
  within,
} from './deadline';
import { createRateLimiter } from './rateLimit';

afterEach(() => {
  vi.useRealTimers();
});

describe('request deadline', () => {
  it('leaves headroom below the 60 s function limit', () => {
    expect(REQUEST_DEADLINE_MS).toBe(50_000);
    expect(REQUEST_DEADLINE_MS).toBeLessThan(60_000);
    expect(MIN_STAGE_MS).toBeGreaterThan(0);
  });

  it('gives each stage its own budget or the time left, whichever is smaller', () => {
    let now = 1_000;
    const deadline = startDeadline(50_000, () => now);
    expect(deadline.remaining()).toBe(50_000);
    expect(deadline.budget(10_000)).toBe(10_000);
    now += 10_000;
    expect(deadline.budget(30_000)).toBe(30_000);
    now += 30_000;
    // Air and Gemini used 40 s: Claude's 30 s budget shrinks to the 10 s that are left.
    expect(deadline.budget(30_000)).toBe(10_000);
    now += 15_000;
    expect(deadline.remaining()).toBe(0);
    expect(deadline.budget(30_000)).toBe(0);
  });

  it('never lets the stages add up past the deadline', () => {
    let now = 0;
    const deadline = startDeadline(50_000, () => now);
    let spent = 0;
    for (const own of [10_000, 30_000, 30_000, 45_000]) {
      const granted = deadline.budget(own);
      spent += granted;
      now += granted;
    }
    expect(spent).toBe(50_000);
  });

  it('falls back to the stage budget when there is no request deadline', () => {
    expect(stageBudget(undefined, 7_000)).toBe(7_000);
    expect(stageBudget(startDeadline(3_000), 7_000)).toBeLessThanOrEqual(3_000);
  });

  it('reads the real clock by default', () => {
    vi.useFakeTimers();
    const deadline = startDeadline();
    vi.advanceTimersByTime(20_000);
    expect(deadline.remaining()).toBe(30_000);
  });
});

describe('within', () => {
  it('settles with the promise when it is in time', async () => {
    await expect(within(Promise.resolve('ok'), 1_000)).resolves.toBe('ok');
    await expect(within(Promise.reject(new Error('boom')), 1_000)).rejects.toThrow('boom');
  });

  it('rejects with a DeadlineError when the promise is too slow', async () => {
    vi.useFakeTimers();
    const slow = within(new Promise(() => {}), 5_000);
    const outcome = expect(slow).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(5_000);
    await outcome;
  });
});

describe('abort helpers', () => {
  it('raceAbort stops waiting as soon as the signal aborts, whatever the promise does', async () => {
    const ctrl = new AbortController();
    const raced = raceAbort(new Promise(() => {}), ctrl.signal);
    ctrl.abort(new Error('stop'));
    await expect(raced).rejects.toThrow('stop');
    await expect(raceAbort(Promise.resolve(1), ctrl.signal)).rejects.toThrow('stop');
  });

  it('raceAbort passes results and failures through and names an abort without a reason', async () => {
    const ctrl = new AbortController();
    await expect(raceAbort(Promise.resolve(7), ctrl.signal)).resolves.toBe(7);
    await expect(raceAbort(Promise.reject(new Error('x')), ctrl.signal)).rejects.toThrow('x');
    ctrl.abort('not an error');
    await expect(raceAbort(Promise.resolve(7), ctrl.signal)).rejects.toThrow('aborted');
  });

  it('untilAborted relays a source and tells it to stop when the signal aborts', async () => {
    const ctrl = new AbortController();
    let returned = false;
    const stuck: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        let sent = false;
        return {
          next: () => {
            if (sent) return new Promise<IteratorResult<string>>(() => {});
            sent = true;
            return Promise.resolve({ done: false, value: 'first' });
          },
          return: () => {
            returned = true;
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };
    const seen: string[] = [];
    const reading = (async () => {
      for await (const piece of untilAborted(stuck, ctrl.signal)) seen.push(piece);
    })();
    await Promise.resolve();
    ctrl.abort(new Error('reader left'));
    await expect(reading).rejects.toThrow('reader left');
    expect(seen).toEqual(['first']);
    expect(returned).toBe(true);
  });

  it('untilAborted ends normally with its source, including one without a return method', async () => {
    const ctrl = new AbortController();
    let step = 0;
    const plain: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          Promise.resolve(
            step < 2 ? { done: false, value: step++ } : { done: true, value: undefined },
          ),
      }),
    };
    const seen: number[] = [];
    for await (const n of untilAborted(plain, ctrl.signal)) seen.push(n);
    expect(seen).toEqual([0, 1]);
  });

  it('abortAfter fires on the timer and can be released early', () => {
    vi.useFakeTimers();
    const timed = abortAfter(1_000, 'too slow');
    vi.advanceTimersByTime(999);
    expect(timed.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(timed.signal.aborted).toBe(true);
    expect((timed.signal.reason as Error).message).toBe('too slow');

    const released = abortAfter(1_000, 'too slow');
    released.done();
    vi.advanceTimersByTime(5_000);
    expect(released.signal.aborted).toBe(false);
  });

  it('abortAfter follows its parent signal, now or later', () => {
    const parent = new AbortController();
    const child = abortAfter(60_000, 'too slow', parent.signal);
    parent.abort(new Error('client left'));
    expect(child.signal.aborted).toBe(true);
    expect((child.signal.reason as Error).message).toBe('client left');
    child.done();
    expect(abortAfter(60_000, 'too slow', parent.signal).signal.aborted).toBe(true);
  });
});

describe('rate limiter: a blocked key stays blocked under key pressure', () => {
  it('keeps a blocked client in memory while new clients push older ones out', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    expect(limiter.check('abuser', 0).ok).toBe(true);
    expect(limiter.check('visitor-1', 1).ok).toBe(true);
    // The abuser is over the limit and keeps trying while fresh addresses arrive.
    for (let i = 2; i < 40; i += 2) {
      expect(limiter.check('abuser', i).ok).toBe(false);
      expect(limiter.check(`visitor-${i}`, i + 1).ok).toBe(true);
    }
    expect(limiter.check('abuser', 100).ok).toBe(false);
  });

  it('still lets the block expire with the window', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
    limiter.check('a', 0);
    expect(limiter.check('a', 500)).toMatchObject({ ok: false, retryAfterSec: 1 });
    expect(limiter.check('a', 1_001).ok).toBe(true);
  });

  it('still bounds memory: a blocked key that goes quiet is evicted like any other', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    limiter.check('a', 0);
    expect(limiter.check('a', 1).ok).toBe(false);
    limiter.check('b', 2);
    limiter.check('c', 3);
    expect(limiter.check('a', 4).ok).toBe(true);
  });
});
