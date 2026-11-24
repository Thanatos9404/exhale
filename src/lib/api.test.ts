import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getHealth, requestPlan, streamChat } from './api';
import { buildPlan } from './planner/engine';
import { DEFAULT_HOUSEHOLD } from './profile/schema';
import type { ChatMessage, HealthResponse, PlanResponse } from './apiTypes';
import { makeSnapshot } from '@/test/fixtures';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function stubFetch(impl: FetchStub) {
  const fetchMock = vi.fn<FetchStub>(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The JSON body of the n-th fetch call. */
const sentBody = (fetchMock: ReturnType<typeof stubFetch>, n = 0): any =>
  JSON.parse(fetchMock.mock.calls[n]![1]!.body as string);

const encoder = new TextEncoder();

function streamOf(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

const place = { lat: 28.61, lon: 77.21, label: 'New Delhi, India' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestPlan', () => {
  // The client validates what the server sends, so the fixture is a real engine plan.
  const planResponse: PlanResponse = {
    plan: buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), new Date('2026-11-23T00:00:00Z')),
    ai: null,
    source: 'rules',
    model: null,
  };

  it('posts the place and household as JSON and returns the plan', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json(planResponse)));
    const signal = new AbortController().signal;
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD, signal)).resolves.toEqual(planResponse);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/plan');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
    });
    expect(sentBody(fetchMock)).toEqual({ place, household: DEFAULT_HOUSEHOLD });
  });

  it('strips characters the server rejects from the place label', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json(planResponse)));
    await requestPlan(
      { ...place, label: 'Café <b>"Saket"</b> #1, Delhi (South) & co/op' },
      DEFAULT_HOUSEHOLD,
    );
    expect(sentBody(fetchMock).place.label).toBe('Café bSaket/b 1, Delhi (South) & co/op');
  });

  it('keeps a place label written in a script that uses combining marks', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json(planResponse)));
    await requestPlan({ ...place, label: 'नई दिल्ली, भारत <b>' }, DEFAULT_HOUSEHOLD);
    expect(sentBody(fetchMock).place.label).toBe('नई दिल्ली, भारत b');
  });

  it('caps the label at 80 characters and replaces an empty one', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json(planResponse)));
    await requestPlan({ ...place, label: 'a'.repeat(120) }, DEFAULT_HOUSEHOLD);
    await requestPlan({ ...place, label: '<>#!?' }, DEFAULT_HOUSEHOLD);
    expect(sentBody(fetchMock, 0).place.label).toBe('a'.repeat(80));
    expect(sentBody(fetchMock, 1).place).toEqual({ lat: 28.61, lon: 77.21, label: 'My place' });
  });

  it("throws an ApiError with the server's message and status", async () => {
    stubFetch(() => Promise.resolve(json({ error: 'Too many requests, slow down' }, 429)));
    const err = await requestPlan(place, DEFAULT_HOUSEHOLD).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      name: 'ApiError',
      message: 'Too many requests, slow down',
      status: 429,
    });
  });

  it('uses a generic message when the error body is not JSON or has no error field', async () => {
    stubFetch(() => Promise.resolve(new Response('<h1>Bad gateway</h1>', { status: 502 })));
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD)).rejects.toMatchObject({
      message: 'Request failed (502)',
      status: 502,
    });
    stubFetch(() => Promise.resolve(json({ detail: 'nope' }, 500)));
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD)).rejects.toMatchObject({
      message: 'Request failed (500)',
      status: 500,
    });
  });

  it('returns the AI wording alongside the plan when a provider wrote it', async () => {
    const tip = { title: 'Wet-mop the floors', detail: 'Dust resuspends.', impact: 'Less dust' };
    const withAi: PlanResponse = {
      ...planResponse,
      ai: {
        headline: 'Air out at 13:00',
        summary: 'A smog lid sits over the city until noon.',
        items: [{ id: 'ventilate', why: 'The afternoon is far cleaner.' }],
        indoorHacks: [tip],
        sustainableSwaps: [tip],
      },
      source: 'gemini',
      model: 'gemini-flash-latest',
    };
    stubFetch(() => Promise.resolve(json(withAi)));
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD)).resolves.toEqual(withAi);
  });

  it.each([
    ['a plan with fields missing', { plan: { headline: 'Air out at 14:00' }, ai: null }],
    ['an unknown source', { ...planResponse, source: 'oracle' }],
    [
      'a dose that is not a number',
      { ...planResponse, plan: { ...planResponse.plan, totals: {} } },
    ],
    ['a JSON null', null],
    ['an array', []],
  ])('rejects %s in a successful response as an ApiError', async (_name, body) => {
    stubFetch(() => Promise.resolve(json(body)));
    const err = await requestPlan(place, DEFAULT_HOUSEHOLD).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'Unexpected response from the server', status: 200 });
  });

  it('rejects a successful response that is not JSON as an ApiError', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>Gateway page</html>', { status: 200 })));
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Unexpected response from the server',
      status: 200,
    });
    stubFetch(() => Promise.resolve(new Response('', { status: 200 })));
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD)).rejects.toBeInstanceOf(ApiError);
  });

  it('ignores an error field that is not a non-empty string', async () => {
    stubFetch(() => Promise.resolve(json({ error: { code: 7 } }, 500)));
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD)).rejects.toMatchObject({
      message: 'Request failed (500)',
    });
    stubFetch(() => Promise.resolve(json({ error: '' }, 400)));
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD)).rejects.toMatchObject({
      message: 'Request failed (400)',
    });
    stubFetch(() => Promise.resolve(json(null, 500)));
    await expect(requestPlan(place, DEFAULT_HOUSEHOLD)).rejects.toMatchObject({
      message: 'Request failed (500)',
    });
  });

  it('rejects with the abort error when the caller aborts', async () => {
    const controller = new AbortController();
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const pending = requestPlan(place, DEFAULT_HOUSEHOLD, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('getHealth', () => {
  it('returns the server status and providers', async () => {
    const health: HealthResponse = {
      ok: true,
      ai: true,
      model: 'gemini-flash-latest',
      providers: ['gemini', 'claude'],
    };
    const fetchMock = stubFetch(() => Promise.resolve(json(health)));
    const signal = new AbortController().signal;
    await expect(getHealth(signal)).resolves.toEqual(health);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', { signal });
  });

  it('accepts a status without the optional provider list and drops unknown fields', async () => {
    stubFetch(() => Promise.resolve(json({ ok: true, ai: false, model: null, geminiKeys: 0 })));
    await expect(getHealth()).resolves.toEqual({ ok: true, ai: false, model: null });
  });

  it.each([
    ['a missing flag', { ok: true, model: null }],
    ['providers that are not strings', { ok: true, ai: true, model: null, providers: [1, 2] }],
    ['a bare string', 'ok'],
  ])('rejects %s as an ApiError', async (_name, body) => {
    stubFetch(() => Promise.resolve(json(body)));
    await expect(getHealth()).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Unexpected response from the server',
      status: 200,
    });
  });

  it('throws an ApiError when the server is down', async () => {
    stubFetch(() => Promise.resolve(json({ error: 'Service unavailable' }, 503)));
    await expect(getHealth()).rejects.toThrow(new ApiError('Service unavailable', 503));
  });
});

describe('streamChat', () => {
  const messages: ChatMessage[] = [{ role: 'user', text: 'Can Nani walk at 7?' }];
  const args = { place, household: DEFAULT_HOUSEHOLD, messages, search: true };

  it('reports the text so far after every chunk and returns the full answer and source', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(streamOf(encoder.encode('Wait until '), encoder.encode('14:00.')), {
          headers: { 'x-exhale-source': 'gemini' },
        }),
      ),
    );
    const onChunk = vi.fn();
    await expect(streamChat(args, onChunk)).resolves.toEqual({
      text: 'Wait until 14:00.',
      source: 'gemini',
    });
    expect(onChunk.mock.calls).toEqual([['Wait until '], ['Wait until 14:00.']]);
  });

  it('decodes a multi-byte character split across chunks', async () => {
    const bytes = encoder.encode('PM2.5 210 µg/m³');
    // "µ" is two bytes in UTF-8; cut between them.
    const cut = bytes.indexOf(0xc2) + 1;
    stubFetch(() => Promise.resolve(new Response(streamOf(bytes.slice(0, cut), bytes.slice(cut)))));
    const onChunk = vi.fn();
    const { text } = await streamChat(args, onChunk);
    expect(text).toBe('PM2.5 210 µg/m³');
    expect(onChunk.mock.calls[0]).toEqual(['PM2.5 210 ']);
    expect(onChunk.mock.calls.flat().join('')).not.toContain('�');
  });

  it('posts the conversation with a sanitised place label', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(streamOf())));
    const signal = new AbortController().signal;
    await streamChat({ ...args, place: { ...place, label: 'Delhi <script>' } }, vi.fn(), signal);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/chat');
    expect(init).toMatchObject({ method: 'POST', signal });
    expect(sentBody(fetchMock)).toEqual({
      place: { ...place, label: 'Delhi script' },
      household: DEFAULT_HOUSEHOLD,
      messages,
      search: true,
    });
  });

  it('returns an empty answer from an empty stream and marks an unknown source', async () => {
    stubFetch(() => Promise.resolve(new Response(streamOf())));
    const onChunk = vi.fn();
    await expect(streamChat(args, onChunk)).resolves.toEqual({ text: '', source: 'unknown' });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('throws an ApiError for an error status', async () => {
    stubFetch(() => Promise.resolve(json({ error: 'Message too long' }, 413)));
    await expect(streamChat(args, vi.fn())).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Message too long',
      status: 413,
    });
  });

  it('throws when a successful response has no body to stream', async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 200 })));
    await expect(streamChat(args, vi.fn())).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Request failed (200)',
      status: 200,
    });
  });

  it('stops with the abort error when the caller aborts mid-stream', async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(encoder.encode('First, close the windows. '));
        controller.signal.addEventListener('abort', () => {
          stream.error(controller.signal.reason);
        });
      },
    });
    stubFetch(() => Promise.resolve(new Response(body)));
    const onChunk = vi.fn(() => {
      controller.abort();
    });
    await expect(streamChat(args, onChunk, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(onChunk.mock.calls).toEqual([['First, close the windows. ']]);
  });
});
