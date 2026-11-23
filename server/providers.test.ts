// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CLAUDE_MODEL, claudeJson, claudeStream, setClaude, strictSchema, type ClaudeLike } from './claude';
import { candidates, configuredKeys, setClient, type GenAiLike } from './gemini';
import { makeSnapshot } from '../src/test/fixtures';
import { DEFAULT_HOUSEHOLD } from '../src/lib/profile/schema';

vi.mock('./airCache.js', () => ({ getAir: vi.fn(async () => makeSnapshot()) }));

const schema = z.object({ ok: z.boolean() });
const fakeClaude = (create: unknown, stream?: unknown) => ({ messages: { create, stream: stream ?? vi.fn() } }) as unknown as ClaudeLike;

describe('Gemini key rotation', () => {
  it('reads keys from GEMINI_API_KEYS and GEMINI_API_KEY without duplicates', () => {
    expect(configuredKeys({ GEMINI_API_KEYS: ' a , b,a', GEMINI_API_KEY: 'c' } as NodeJS.ProcessEnv)).toEqual(['a', 'b', 'c']);
    expect(configuredKeys({} as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('tries the best model on every key before falling to the next model', () => {
    const k = (key: string) => ({ key, client: {} as GenAiLike });
    const list = candidates([k('k1'), k('k2')]);
    expect(list.slice(0, 2).map((c) => `${c.key}/${c.model}`)).toEqual([`k1/${list[0]!.model}`, `k2/${list[0]!.model}`]);
  });
});

describe('Claude Haiku fallback', () => {
  afterEach(() => setClaude(undefined));

  it('closes every object in the JSON schema for structured outputs', () => {
    const s = strictSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'object', properties: {} } } } });
    expect(s.additionalProperties).toBe(false);
    expect((s.properties as { a: { items: { additionalProperties: boolean } } }).a.items.additionalProperties).toBe(false);
  });

  it('returns validated JSON from Haiku with low effort and a JSON schema format', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] });
    const r = await claudeJson({ system: 's', prompt: 'p', jsonSchema: { type: 'object' }, validate: schema, client: fakeClaude(create) });
    expect(r).toEqual({ data: { ok: true }, model: CLAUDE_MODEL });
    const req = create.mock.calls[0]![0];
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
  });

  it('treats refusals, invalid JSON and errors as no answer', async () => {
    const refuse = vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const bad = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":"x"}' }] });
    const boom = vi.fn().mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const create of [refuse, bad, boom]) {
      setClaude(undefined);
      await expect(claudeJson({ system: 's', prompt: 'p', jsonSchema: {}, validate: schema, client: fakeClaude(create) })).resolves.toBeNull();
    }
  });

  it('enforces a per-minute budget', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] });
    setClaude(fakeClaude(create));
    const results = [];
    for (let i = 0; i < 22; i++) results.push(await claudeJson({ system: 's', prompt: 'p', jsonSchema: {}, validate: schema }));
    expect(results.filter(Boolean)).toHaveLength(20);
  });

  it('streams text deltas', async () => {
    async function* events() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Keep ' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'windows shut.' } };
    }
    let out = '';
    for await (const t of claudeStream({ system: 's', messages: [{ role: 'user', content: 'hi' }], client: fakeClaude(vi.fn(), vi.fn(() => events())) })) out += t;
    expect(out).toBe('Keep windows shut.');
  });
});

describe('API provider fallback order', () => {
  let ip = 100;
  const post = (body: unknown) =>
    new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ip}` },
      body: JSON.stringify(body),
    });
  const place = { lat: 28.61, lon: 77.21, label: 'New Delhi, India' };

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Gemini configured but failing every call.
    setClient({ models: { generateContent: vi.fn().mockRejectedValue(new Error('503 high demand')), generateContentStream: vi.fn().mockRejectedValue(new Error('503 high demand')) } } as unknown as GenAiLike);
  });
  afterEach(() => {
    setClient(undefined);
    setClaude(undefined);
  });

  it('uses Claude Haiku for the plan when Gemini is down', async () => {
    const ai = {
      headline: 'Walk at 13:00.',
      summary: 'Lid until noon.',
      items: [{ id: 'ventilate', why: 'Cleaner afternoon air.' }],
      indoorHacks: [{ title: 'Mop', detail: 'Wet-mop floors.', impact: 'Less dust' }],
      sustainableSwaps: [{ title: 'Metro', detail: 'Take the metro.', impact: 'Less CO2' }],
    };
    setClaude(fakeClaude(vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(ai) }] })));
    const { POST } = await import('../api/plan');
    const body = await (await POST(post({ place, household: DEFAULT_HOUSEHOLD }))).json();
    expect(body.source).toBe('claude');
    expect(body.model).toBe(CLAUDE_MODEL);
  }, 60_000);

  it('streams a Claude answer in chat when Gemini is down', async () => {
    async function* events() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'From Claude.' } };
    }
    setClaude(fakeClaude(vi.fn(), vi.fn(() => events())));
    const { POST } = await import('../api/chat');
    const res = await POST(post({ place, household: DEFAULT_HOUSEHOLD, messages: [{ role: 'user', text: 'Open windows?' }] }));
    expect(await res.text()).toBe('From Claude.');
  }, 60_000);
});
