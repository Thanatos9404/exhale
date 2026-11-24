// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  CLAUDE_TIMEOUT_MS,
  claudeJson,
  claudeStream,
  getClaude,
  setClaude,
  type ClaudeLike,
} from './claude';
import { startDeadline } from './deadline';

const schema = z.object({ ok: z.boolean() });
const fake = (create: unknown, stream: unknown = vi.fn()) =>
  ({ messages: { create, stream } }) as unknown as ClaudeLike;
const ask = (client: ClaudeLike, extra: object = {}) =>
  claudeJson({ system: 's', prompt: 'p', jsonSchema: {}, validate: schema, client, ...extra });
const delta = (text: string) => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
});

async function drain(gen: AsyncGenerator<string, boolean>) {
  let text = '';
  let step = await gen.next();
  while (!step.done) {
    text += step.value;
    step = await gen.next();
  }
  return { text, started: step.value };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  setClaude(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setClaude(undefined);
});

describe('Claude client configuration', () => {
  it('never retries inside the SDK and uses the named timeout', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const client = getClaude() as unknown as { maxRetries: number; timeout: number };
    expect(client.maxRetries).toBe(0);
    expect(client.timeout).toBe(CLAUDE_TIMEOUT_MS);
    expect(CLAUDE_TIMEOUT_MS).toBe(30_000);
  });

  it('is absent without a key', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ' ');
    expect(getClaude()).toBeNull();
  });
});

describe('claudeJson: truncated plans', () => {
  it('treats stop_reason max_tokens as a failure, even when the text happens to parse', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: '{"ok":true}' }],
    });
    await expect(ask(fake(create))).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[exhale] Claude ran out of tokens before the plan was complete',
    );
  });

  it('treats a truncated, unparseable plan as a failure too', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: '{"ok":tr' }],
    });
    await expect(ask(fake(create))).resolves.toBeNull();
  });

  it('still accepts a complete answer', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"ok":true}' }],
    });
    await expect(ask(fake(create))).resolves.toMatchObject({ data: { ok: true } });
  });
});

describe('claudeJson inside the request deadline', () => {
  it('passes the SDK the time left as its timeout, with an abort signal', async () => {
    let now = 0;
    const deadline = startDeadline(50_000, () => now);
    now = 42_000;
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"ok":true}' }],
    });
    await ask(fake(create), { deadline });
    const options = create.mock.calls[0]![1] as { timeout: number; signal: AbortSignal };
    expect(options.timeout).toBe(8_000);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses its own 30 s budget when plenty of time is left', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await ask(fake(create), { deadline: startDeadline() });
    expect((create.mock.calls[0]![1] as { timeout: number }).timeout).toBe(CLAUDE_TIMEOUT_MS);
  });

  it('is skipped, without spending budget, when too little time is left', async () => {
    let now = 0;
    const deadline = startDeadline(50_000, () => now);
    now = 49_500;
    const create = vi.fn();
    await expect(ask(fake(create), { deadline })).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('gives up on a call that hangs, even if the SDK ignores the abort signal', async () => {
    vi.useFakeTimers();
    const deadline = startDeadline(50_000);
    await vi.advanceTimersByTimeAsync(44_000);
    let signal: AbortSignal | undefined;
    const create = vi.fn((_params: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    const pending = ask(fake(create), { deadline });
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(pending).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledWith('[exhale] Claude call failed:', 'Claude timeout');
  });
});

describe('claudeStream inside the request deadline', () => {
  const turns = [{ role: 'user' as const, content: 'hi' }];

  it('is skipped when too little time is left or the reader has already gone', async () => {
    let now = 0;
    const deadline = startDeadline(50_000, () => now);
    now = 49_000;
    const stream = vi.fn();
    const client = fake(vi.fn(), stream);
    expect(await drain(claudeStream({ system: 's', messages: turns, client, deadline }))).toEqual({
      text: '',
      started: false,
    });
    const gone = AbortSignal.abort();
    expect(
      (await drain(claudeStream({ system: 's', messages: turns, client, signal: gone }))).started,
    ).toBe(false);
    expect(stream).not.toHaveBeenCalled();
  });

  it('yields nothing and returns when Claude never produces a token in time', async () => {
    vi.useFakeTimers();
    const hangs: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
    };
    const client = fake(
      vi.fn(),
      vi.fn(() => hangs),
    );
    const done = drain(claudeStream({ system: 's', messages: turns, client }));
    await vi.advanceTimersByTimeAsync(CLAUDE_TIMEOUT_MS);
    expect(await done).toEqual({ text: '', started: false });
  });

  it('ends a stream that stalls midway with a note when the time runs out', async () => {
    vi.useFakeTimers();
    async function* stalls() {
      yield delta('Keep windows ');
      await new Promise(() => {});
    }
    const client = fake(
      vi.fn(),
      vi.fn(() => stalls()),
    );
    const deadline = startDeadline(10_000);
    const done = drain(claudeStream({ system: 's', messages: turns, client, deadline }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await done).toEqual({
      text: 'Keep windows \n\n_The answer was cut short. Please ask again._',
      started: true,
    });
  });

  it('stops silently, and aborts the SDK call, when the reader goes away', async () => {
    const reader = new AbortController();
    let upstream: AbortSignal | undefined;
    async function* stalls() {
      yield delta('Hello');
      await new Promise(() => {});
    }
    const stream = vi.fn((_params: unknown, options: { signal: AbortSignal }) => {
      upstream = options.signal;
      return stalls();
    });
    const gen = claudeStream({
      system: 's',
      messages: turns,
      client: fake(vi.fn(), stream),
      signal: reader.signal,
    });
    expect((await gen.next()).value).toBe('Hello');
    reader.abort();
    expect(await gen.next()).toEqual({ done: true, value: true });
    expect(upstream?.aborted).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs an SDK failure and ends without a note when nothing was sent', async () => {
    const client = fake(
      vi.fn(),
      vi.fn(() => {
        throw new Error('socket hang up');
      }),
    );
    expect(await drain(claudeStream({ system: 's', messages: turns, client }))).toEqual({
      text: '',
      started: false,
    });
    expect(warn).toHaveBeenCalledWith('[exhale] Claude stream failed:', 'socket hang up');
  });
});
