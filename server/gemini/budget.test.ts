// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { startDeadline } from '../deadline';
import { breaker } from './breaker';
import {
  GEMINI_CALLS_PER_MINUTE,
  GeminiBudgetError,
  resetGeminiBudget,
  takeGeminiCall,
} from './budget';
import { keyCount, modelChain, setClient, type GenAiLike } from './candidates';
import { FIRST_TOKEN_TIMEOUT_MS, GROUNDED_DEADLINE_MS, OVERALL_DEADLINE_MS } from './config';
import { hedged } from './hedged';
import { generateJson } from './json';
import { streamText } from './stream';

const schema = z.object({ ok: z.boolean() });
const fake = (generateContent: unknown, generateContentStream: unknown = vi.fn()): GenAiLike =>
  ({ models: { generateContent, generateContentStream } }) as unknown as GenAiLike;

async function* chunks(...texts: string[]) {
  for (const text of texts) yield { text };
}

async function drain(gen: AsyncGenerator<string, unknown>) {
  let text = '';
  let step = await gen.next();
  while (!step.done) {
    text += step.value;
    step = await gen.next();
  }
  return { text, result: step.value };
}

/** Spends whatever is left of this minute's budget. */
function spendBudget() {
  for (let i = 0; i < GEMINI_CALLS_PER_MINUTE; i++) takeGeminiCall();
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  setClient(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setClient(undefined);
});

describe('Gemini call budget', () => {
  it('allows a fixed number of calls per minute per instance, then refuses', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < GEMINI_CALLS_PER_MINUTE; i++) expect(takeGeminiCall(t0 + i)).toBe(true);
    expect(takeGeminiCall(t0 + 100)).toBe(false);
    // The window slides: a minute after the first call there is room again.
    expect(takeGeminiCall(t0 + 60_001)).toBe(true);
  });

  it('leaves the key count available to server code, though /api/health no longer reports it', () => {
    setClient(null);
    expect(keyCount()).toBe(0);
    setClient(fake(vi.fn()));
    expect(keyCount()).toBe(1);
  });

  it('is restored by the test hooks', () => {
    spendBudget();
    expect(takeGeminiCall()).toBe(false);
    resetGeminiBudget();
    expect(takeGeminiCall()).toBe(true);
    spendBudget();
    setClient(undefined);
    expect(takeGeminiCall()).toBe(true);
  });

  it('counts every upstream attempt, so one request cannot fan out without bound', async () => {
    const generateContent = vi.fn().mockRejectedValue(new Error('503 overloaded'));
    const opts = { system: 's', prompt: 'p', jsonSchema: {}, validate: schema, backoffMs: 1 };
    const client = fake(generateContent);
    // Each request sweeps every model three times; the budget ends the storm.
    for (let i = 0; i < 20; i++) await generateJson({ ...opts, client });
    expect(generateContent).toHaveBeenCalledTimes(GEMINI_CALLS_PER_MINUTE);
  });

  it('makes a JSON request return null at once, without calling Gemini or benching a pair', async () => {
    spendBudget();
    const generateContent = vi.fn().mockResolvedValue({ text: '{"ok":true}' });
    const started = Date.now();
    const result = await generateJson({
      system: 's',
      prompt: 'p',
      jsonSchema: {},
      validate: schema,
      client: fake(generateContent),
    });
    expect(result).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
    // No backoff rounds: the caller moves straight to the next provider.
    expect(Date.now() - started).toBeLessThan(500);
    expect(breaker.isCooling({ key: 'k1', model: modelChain()[0]! })).toBe(false);
  });

  it('makes a stream return null at once, without calling Gemini', async () => {
    spendBudget();
    const stream = vi.fn(async () => chunks('Hello'));
    const { text, result } = await drain(
      streamText({ system: 's', contents: [], client: fake(vi.fn(), stream) }),
    );
    expect(text).toBe('');
    expect(result).toBeNull();
    expect(stream).not.toHaveBeenCalled();
  });
});

describe('hedged: fatal failures', () => {
  const timing = { hedgeAfterMs: 5, deadlineMs: 2_000, perAttemptMs: 500, rounds: 3, backoffMs: 5 };

  it('starts nothing more after a fatal failure and skips the remaining rounds', async () => {
    const run = vi.fn(() => Promise.reject(new GeminiBudgetError()));
    const result = await hedged(['a', 'b', 'c'], run, {
      ...timing,
      isFatal: (err) => err instanceof GeminiBudgetError,
    });
    expect(result).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('still takes an answer from an attempt that was already running', async () => {
    const run = vi.fn((item: string) =>
      item === 'a'
        ? new Promise<string>((resolve) => setTimeout(() => resolve('late answer'), 40))
        : Promise.reject(new GeminiBudgetError()),
    );
    const result = await hedged(['a', 'b', 'c'], run, {
      ...timing,
      isFatal: (err) => err instanceof GeminiBudgetError,
    });
    expect(result).toBe('late answer');
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('Gemini inside the request deadline', () => {
  it('keeps its own budgets below the request deadline', () => {
    expect(OVERALL_DEADLINE_MS).toBeLessThanOrEqual(30_000);
    expect(GROUNDED_DEADLINE_MS).toBeLessThan(OVERALL_DEADLINE_MS);
  });

  it('skips a JSON request when too little of the deadline is left', async () => {
    let now = 0;
    const deadline = startDeadline(50_000, () => now);
    now = 49_000;
    const generateContent = vi.fn().mockResolvedValue({ text: '{"ok":true}' });
    const result = await generateJson({
      system: 's',
      prompt: 'p',
      jsonSchema: {},
      validate: schema,
      client: fake(generateContent),
      deadline,
    });
    expect(result).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('ends a hanging JSON request when the time left runs out, not after its own 30 s', async () => {
    vi.useFakeTimers();
    const deadline = startDeadline(50_000);
    await vi.advanceTimersByTimeAsync(40_000);
    const generateContent = vi.fn(() => new Promise(() => {}));
    const pending = generateJson({
      system: 's',
      prompt: 'p',
      jsonSchema: {},
      validate: schema,
      client: fake(generateContent),
      deadline,
    });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeNull();
  });

  it('stops looking for a first token when its share of the deadline is used up', async () => {
    vi.useFakeTimers();
    // A stream that never produces a token and never notices the abort signal.
    const stream = vi.fn(() => new Promise(() => {}));
    const done = drain(streamText({ system: 's', contents: [], client: fake(vi.fn(), stream) }));
    await vi.advanceTimersByTimeAsync(OVERALL_DEADLINE_MS);
    const { text, result } = await done;
    expect(text).toBe('');
    expect(result).toBeNull();
    // 30 s of 8 s waits: four attempts, then too little time is left for a fifth.
    expect(stream).toHaveBeenCalledTimes(Math.ceil(OVERALL_DEADLINE_MS / FIRST_TOKEN_TIMEOUT_MS));
  });

  it('gives a search-grounded stream a shorter share', async () => {
    vi.useFakeTimers();
    const stream = vi.fn(() => new Promise(() => {}));
    const opts = { system: 's', contents: [], search: true, client: fake(vi.fn(), stream) };
    const done = drain(streamText(opts));
    await vi.advanceTimersByTimeAsync(GROUNDED_DEADLINE_MS);
    expect((await done).result).toBeNull();
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it('does not bench a pair for a first-token wait that the deadline cut short', async () => {
    vi.useFakeTimers();
    const deadline = startDeadline(50_000);
    await vi.advanceTimersByTimeAsync(47_000);
    const stream = vi.fn(() => new Promise(() => {}));
    const done = drain(
      streamText({ system: 's', contents: [], client: fake(vi.fn(), stream), deadline }),
    );
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await done).result).toBeNull();
    expect(stream).toHaveBeenCalledTimes(1);
    expect(breaker.isCooling({ key: 'k1', model: modelChain()[0]! })).toBe(false);
  });

  it('cuts a running stream short when the request deadline arrives', async () => {
    vi.useFakeTimers();
    const deadline = startDeadline(50_000);
    async function* stalls() {
      yield { text: 'Keep windows ' };
      await new Promise(() => {});
    }
    const stream = vi.fn(async () => stalls());
    const done = drain(
      streamText({ system: 's', contents: [], client: fake(vi.fn(), stream), deadline }),
    );
    await vi.advanceTimersByTimeAsync(50_000);
    const { text, result } = await done;
    expect(text).toBe('Keep windows \n\n_The answer was cut short. Please ask again._');
    expect(result).toBeNull();
  });
});

describe('a reader that goes away', () => {
  it('aborts the upstream call, sends nothing more and benches nothing', async () => {
    const reader = new AbortController();
    let upstream: AbortSignal | undefined;
    async function* stalls() {
      yield { text: 'Hello' };
      await new Promise(() => {});
    }
    const stream = vi.fn(async (req: { config: { abortSignal: AbortSignal } }) => {
      upstream = req.config.abortSignal;
      return stalls();
    });
    const gen = streamText({
      system: 's',
      contents: [],
      client: fake(vi.fn(), stream),
      signal: reader.signal,
    });
    expect((await gen.next()).value).toBe('Hello');
    reader.abort();
    const end = await gen.next();
    expect(end).toEqual({ done: true, value: null });
    expect(upstream?.aborted).toBe(true);
    expect(breaker.isCooling({ key: 'k1', model: modelChain()[0]! })).toBe(false);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('does not start a call for a reader that has already gone', async () => {
    const stream = vi.fn(async () => chunks('Hello'));
    const { text } = await drain(
      streamText({
        system: 's',
        contents: [],
        client: fake(vi.fn(), stream),
        signal: AbortSignal.abort(),
      }),
    );
    expect(text).toBe('');
    expect(stream).not.toHaveBeenCalled();
  });

  it('aborts the upstream call when the consumer stops reading early', async () => {
    let upstream: AbortSignal | undefined;
    const stream = vi.fn(async (req: { config: { abortSignal: AbortSignal } }) => {
      upstream = req.config.abortSignal;
      return chunks('one', 'two', 'three');
    });
    const gen = streamText({ system: 's', contents: [], client: fake(vi.fn(), stream) });
    await gen.next();
    await gen.return(null);
    expect(upstream?.aborted).toBe(true);
  });
});
