// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerChat, type ChatChunk } from '../server/chatAnswer';
import { DEFAULT_HOUSEHOLD } from '../src/lib/profile/schema';
import { makeSnapshot } from '../src/test/fixtures';
import { POST } from './chat';

/**
 * The response stream when the answer chain itself misbehaves. The chain is replaced by a fake,
 * because the real providers catch their own failures and never throw.
 */

vi.mock('../server/airCache.js', () => ({ getAir: vi.fn(async () => makeSnapshot()) }));
vi.mock('../server/chatAnswer.js', () => ({ answerChat: vi.fn() }));

let ip = 0;
const post = () =>
  new Request('https://exhale.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': `198.19.0.${++ip}` },
    body: JSON.stringify({
      place: { lat: 28.61, lon: 77.21, label: 'New Delhi, India' },
      household: DEFAULT_HOUSEHOLD,
      messages: [{ role: 'user', text: 'Open the windows now?' }],
    }),
  });

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A chain that yields the given chunks and then, optionally, fails. */
async function* chain(chunks: ChatChunk[], failure?: Error): AsyncGenerator<ChatChunk, void> {
  await Promise.resolve();
  for (const chunk of chunks) yield chunk;
  if (failure) throw failure;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
});
afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  vi.restoreAllMocks();
});

describe('the chat response stream', () => {
  it('ends with a note, not an unhandled rejection, when the chain throws midway', async () => {
    vi.mocked(answerChat).mockImplementation(async function* (a): AsyncGenerator<ChatChunk, void> {
      yield { source: 'gemini', text: 'Keep windows ' };
      expect(a.signal.aborted).toBe(false);
      throw new Error('provider exploded');
    });
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-exhale-source')).toBe('gemini');
    expect(await res.text()).toBe('Keep windows \n\n_The answer was cut short. Please ask again._');
    await settle();
    expect(warn).toHaveBeenCalledWith('[exhale] chat stream failed:', 'provider exploded');
    expect(unhandled).toEqual([]);
  });

  it('relays every chunk in order and closes the stream', async () => {
    vi.mocked(answerChat).mockImplementation(() =>
      chain(['One. ', 'Two. ', 'Three.'].map((text) => ({ source: 'claude', text }))),
    );
    const res = await POST(post());
    expect(res.headers.get('x-exhale-source')).toBe('claude');
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('One. Two. Three.');
  });

  it('aborts the chain and swallows the write error when the reader cancels', async () => {
    let signal: AbortSignal | undefined;
    let release = () => {};
    vi.mocked(answerChat).mockImplementation(async function* (a): AsyncGenerator<ChatChunk, void> {
      signal = a.signal;
      yield { source: 'gemini', text: 'First' };
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      // The reader has gone: this chunk is written to a closed stream.
      yield { source: 'gemini', text: 'Second' };
    });
    const res = await POST(post());
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(signal?.aborted).toBe(true);
    release();
    await settle();
    expect(warn).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });

  it('answers 500 with a safe message when the chain fails before the first chunk', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(answerChat).mockImplementation(() => chain([], new Error('secret internal detail')));
    const res = await POST(post());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret');
    expect(unhandled).toEqual([]);
  });

  it('sends an empty answer when the chain yields nothing because the client left', async () => {
    vi.mocked(answerChat).mockImplementation(() => chain([]));
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});
