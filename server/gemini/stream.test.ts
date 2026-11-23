// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { breaker } from './breaker';
import { modelChain, setClient, type GenAiLike } from './candidates';
import { formatSources, streamText, type StreamOptions, type StreamResult } from './stream';

async function* chunks(...texts: string[]) {
  for (const text of texts) yield { text };
}

/** Drains the generator, returning the text and the generator's return value. */
async function collect(gen: AsyncGenerator<string, StreamResult | null>) {
  let text = '';
  let step = await gen.next();
  while (!step.done) {
    text += step.value;
    step = await gen.next();
  }
  return { text, result: step.value };
}

const fakeClient = (generateContentStream: unknown): GenAiLike =>
  ({ models: { generateContent: vi.fn(), generateContentStream } }) as unknown as GenAiLike;

const run = (client: GenAiLike, extra: Partial<StreamOptions> = {}) =>
  collect(streamText({ system: 's', contents: [], client, ...extra }));

describe('streamText', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    setClient(undefined);
    vi.restoreAllMocks();
  });

  it('falls through to the next model before the first token and benches the failed pair', async () => {
    const [first, second] = modelChain();
    const stream = vi.fn(async (req: { model: string }) => {
      if (req.model === first) throw new Error('503 model overloaded');
      return chunks('Hello');
    });
    const { text, result } = await run(fakeClient(stream));
    expect(text).toBe('Hello');
    expect(result).toEqual({ model: second });
    expect(breaker.isCooling({ key: 'k1', model: first! })).toBe(true);
  });

  it('never stitches two answers: a stream that breaks midway ends with a note', async () => {
    async function* breaks() {
      yield { text: 'Keep windows ' };
      throw new Error('503 overloaded');
    }
    const stream = vi.fn(async () => breaks());
    const { text, result } = await run(fakeClient(stream));
    expect(text).toBe('Keep windows \n\n_The answer was cut short. Please ask again._');
    expect(result).toBeNull();
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('does not bench a pair when only search grounding is out of quota', async () => {
    const [first, second] = modelChain();
    const stream = vi.fn(async (req: { model: string }) => {
      if (req.model === first) throw new Error('429 search quota exceeded');
      return chunks('Grounded.');
    });
    const { result } = await run(fakeClient(stream), { search: true });
    expect(result).toEqual({ model: second });
    expect(breaker.isCooling({ key: 'k1', model: first! })).toBe(false);
  });

  it('skips pairs that are known to be out of quota without calling them', async () => {
    const [first, second] = modelChain();
    breaker.trip({ key: 'k1', model: first! }, new Error('quota exhausted'));
    const stream = vi.fn(async (req: { model: string }) => chunks(req.model));
    const { text } = await run(fakeClient(stream));
    expect(text).toBe(second);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('gives up without retrying a non-retryable error', async () => {
    const stream = vi.fn(async () => {
      throw new Error('400 invalid argument');
    });
    const { text, result } = await run(fakeClient(stream));
    expect(text).toBe('');
    expect(result).toBeNull();
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('returns null at once when Gemini is not configured', async () => {
    const { text, result } = await collect(streamText({ system: 's', contents: [], client: null }));
    expect(text).toBe('');
    expect(result).toBeNull();
  });
});

describe('formatSources', () => {
  it('lists at most five sources and strips brackets from titles', () => {
    const sources = new Map(
      Array.from({ length: 7 }, (_, i) => [`https://example.org/${i}`, `[Page] ${i}`] as const),
    );
    const out = formatSources(sources);
    expect(out.startsWith('\n\n**Sources**\n')).toBe(true);
    expect(out.match(/^- /gm)).toHaveLength(5);
    expect(out).toContain('- [Page 0](https://example.org/0)');
  });
});
