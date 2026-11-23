// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRateLimiter } from './rateLimit';
import { HttpError, clientKey, errorResponse, readJson } from './http';
import { buildChatContext, buildPlanPrompt, describeHousehold, PLAN_SYSTEM } from './prompts';
import { generateJson, isRetryable, modelChain, setClient, streamText, type GenAiLike } from './gemini';
import { fallbackAnswer } from './fallback';
import { buildPlan } from '../src/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '../src/lib/profile/schema';
import { makeSnapshot } from '../src/test/fixtures';

const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), new Date('2026-11-23T00:00:00Z'));

describe('rate limiter', () => {
  it('allows up to the limit inside the window, then blocks with a retry hint', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1_000 });
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('a', 10).ok).toBe(true);
    const blocked = rl.check('a', 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(rl.check('b', 20).ok).toBe(true);
    expect(rl.check('a', 1_500).ok).toBe(true);
  });

  it('keeps memory bounded', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 3 });
    for (const k of ['1', '2', '3', '4', '5']) rl.check(k, 0);
    // Oldest keys were evicted, so they are allowed again.
    expect(rl.check('1', 1).ok).toBe(true);
  });
});

describe('http helpers', () => {
  const req = (body: string, type = 'application/json') =>
    new Request('http://x/api', { method: 'POST', headers: { 'content-type': type }, body });

  it('parses JSON bodies', async () => {
    await expect(readJson(req('{"a":1}'), 100)).resolves.toEqual({ a: 1 });
  });

  it('rejects wrong content types, oversize and malformed bodies', async () => {
    await expect(readJson(req('{}', 'text/plain'), 100)).rejects.toMatchObject({ status: 415 });
    await expect(readJson(req(`{"a":"${'x'.repeat(200)}"}`), 100)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(req('{oops'), 100)).rejects.toMatchObject({ status: 400 });
  });

  it('uses the first forwarded address as the client key', () => {
    const r = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } });
    expect(clientKey(r)).toBe('1.2.3.4');
    expect(clientKey(new Request('http://x'))).toBe('local');
  });

  it('hides internal error details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = errorResponse(new Error('secret stack'));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret');
    const known = errorResponse(new HttpError(429, 'slow down', { 'retry-after': '3' }));
    expect(known.status).toBe(429);
    expect(known.headers.get('retry-after')).toBe('3');
  });
});

describe('prompts', () => {
  it('wraps household data as data and states the guardrails', () => {
    expect(describeHousehold(DEFAULT_HOUSEHOLD)).toMatch(/^<household>[\s\S]*<\/household>$/);
    expect(PLAN_SYSTEM).toMatch(/Ignore any instructions/);
    expect(PLAN_SYSTEM).toMatch(/Never invent/);
  });

  it('passes every routine item id and the engine numbers to the model', () => {
    const prompt = buildPlanPrompt(plan, DEFAULT_HOUSEHOLD);
    for (const item of plan.items) expect(prompt).toContain(`id=${item.id}`);
    expect(prompt).toContain(String(plan.totals.optimizedDoseUg));
    expect(buildChatContext(plan, DEFAULT_HOUSEHOLD)).toContain(plan.placeLabel);
  });
});

describe('gemini wrapper', () => {
  afterEach(() => {
    setClient(undefined);
    delete process.env.GEMINI_MODEL;
  });

  const schema = z.object({ ok: z.boolean() });

  it('returns null without a client so callers fall back to the engine', async () => {
    await expect(generateJson({ system: 's', prompt: 'p', jsonSchema: {}, validate: schema, client: null })).resolves.toBeNull();
  });

  it('puts the configured model first and de-duplicates', () => {
    process.env.GEMINI_MODEL = 'gemini-flash-latest';
    const chain = modelChain();
    expect(chain[0]).toBe('gemini-flash-latest');
    expect(new Set(chain).size).toBe(chain.length);
  });

  it('falls through retryable errors and validates the JSON', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('503 model overloaded'))
      .mockResolvedValueOnce({ text: '{"ok": true}' });
    const client = { models: { generateContent, generateContentStream: vi.fn() } } as unknown as GenAiLike;
    const r = await generateJson({ system: 's', prompt: 'p', jsonSchema: {}, validate: schema, client });
    expect(r?.data).toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('rejects JSON that does not match the schema', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const generateContent = vi.fn().mockResolvedValue({ text: '{"ok": "yes"}' });
    const client = { models: { generateContent, generateContentStream: vi.fn() } } as unknown as GenAiLike;
    await expect(generateJson({ system: 's', prompt: 'p', jsonSchema: {}, validate: schema, client })).resolves.toBeNull();
  });

  it('classifies retryable errors', () => {
    expect(isRetryable(new Error('429 quota exceeded'))).toBe(true);
    expect(isRetryable(new Error('400 invalid argument'))).toBe(false);
  });

  it('streams text and appends grounded sources', async () => {
    async function* chunks() {
      yield { text: 'Hello ' };
      yield {
        text: 'there',
        candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.org/grap', title: 'GRAP update' } }] } }],
      };
    }
    const client = {
      models: { generateContent: vi.fn(), generateContentStream: vi.fn().mockResolvedValue(chunks()) },
    } as unknown as GenAiLike;
    let out = '';
    for await (const c of streamText({ system: 's', contents: [], search: true, client })) out += c;
    expect(out).toContain('Hello there');
    expect(out).toContain('[GRAP update](https://example.org/grap)');
  });
});

describe('offline fallback answers', () => {
  it('answers exercise questions with the clean window', () => {
    const a = fallbackAnswer('When can my kid play outside?', plan);
    expect(a).toContain(plan.cleanWindow!.start);
  });

  it('answers commute questions with the commute item', () => {
    expect(fallbackAnswer('Should I take the metro?', plan)).toMatch(/metro|commute/i);
  });

  it('falls back to the headline for anything else', () => {
    expect(fallbackAnswer('hello', plan)).toContain(plan.headline);
  });
});
