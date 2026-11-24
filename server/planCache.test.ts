// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlan } from '../src/lib/planner/engine';
import { DEFAULT_HOUSEHOLD, type Household } from '../src/lib/profile/schema';
import { makeSnapshot } from '../src/test/fixtures';
import { setClaude, type ClaudeLike } from './claude';
import { startDeadline } from './deadline';
import { setClient, type GenAiLike } from './gemini';
import { clearPlanCache, explainPlan } from './planAi';
import { PLAN_CACHE_MAX_ENTRIES, PLAN_CACHE_TTL_MS, createPlanCache } from './planCache';
import { buildPlanPrompt } from './prompts';
import type { AiPlan } from './schemas';

const MINUTE = 60_000;

describe('plan cache', () => {
  it('returns what was stored for exactly that prompt', () => {
    const cache = createPlanCache<string>();
    expect(cache.get('prompt A', 0)).toBeNull();
    cache.set('prompt A', 'answer A', 0);
    expect(cache.get('prompt A', 1)).toBe('answer A');
    expect(cache.get('prompt A ', 1)).toBeNull();
    expect(cache.get('prompt a', 1)).toBeNull();
  });

  it('keeps an answer for ten minutes and never serves it after that', () => {
    expect(PLAN_CACHE_TTL_MS).toBe(10 * MINUTE);
    const cache = createPlanCache<string>();
    cache.set('p', 'answer', 0);
    expect(cache.get('p', 10 * MINUTE - 1)).toBe('answer');
    expect(cache.get('p', 10 * MINUTE)).toBeNull();
    // The expired entry is dropped on that read, not kept around.
    expect(cache.size()).toBe(0);
  });

  it('counts the ten minutes from the latest answer for a prompt', () => {
    const cache = createPlanCache<string>();
    cache.set('p', 'old', 0);
    cache.set('p', 'new', 6 * MINUTE);
    expect(cache.size()).toBe(1);
    expect(cache.get('p', 15 * MINUTE)).toBe('new');
    expect(cache.get('p', 16 * MINUTE)).toBeNull();
  });

  it('never grows past its bound: the oldest answers are dropped first', () => {
    const cache = createPlanCache<number>();
    for (let i = 0; i < PLAN_CACHE_MAX_ENTRIES + 50; i++) cache.set(`prompt ${i}`, i, i);
    expect(cache.size()).toBe(PLAN_CACHE_MAX_ENTRIES);
    expect(cache.get('prompt 0', 300)).toBeNull();
    expect(cache.get('prompt 49', 300)).toBeNull();
    expect(cache.get('prompt 50', 300)).toBe(50);
    expect(cache.get(`prompt ${PLAN_CACHE_MAX_ENTRIES + 49}`, 300)).toBe(
      PLAN_CACHE_MAX_ENTRIES + 49,
    );
  });

  it('honours a custom bound and can be emptied', () => {
    const cache = createPlanCache<number>(MINUTE, 2);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    cache.set('c', 3, 0);
    expect(cache.get('a', 1)).toBeNull();
    expect(cache.get('c', 1)).toBe(3);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('never lets two households share an answer', () => {
    const cache = createPlanCache<string>();
    const air = makeSnapshot();
    const at = new Date('2026-11-23T00:00:00Z');
    const promptFor = (household: Household) =>
      buildPlanPrompt(buildPlan(household, air, at), household);
    const variants: Household[] = [
      DEFAULT_HOUSEHOLD,
      { ...DEFAULT_HOUSEHOLD, name: 'Sharma family' },
      { ...DEFAULT_HOUSEHOLD, home: { ...DEFAULT_HOUSEHOLD.home, purifier: 'large' } },
      { ...DEFAULT_HOUSEHOLD, commute: { ...DEFAULT_HOUSEHOLD.commute, mode: 'metro' } },
      { ...DEFAULT_HOUSEHOLD, members: DEFAULT_HOUSEHOLD.members.slice(0, 1) },
      {
        ...DEFAULT_HOUSEHOLD,
        members: DEFAULT_HOUSEHOLD.members.map((m, i) => (i === 0 ? { ...m, name: 'Asha' } : m)),
      },
    ];
    const prompts = variants.map(promptFor);
    expect(new Set(prompts).size).toBe(variants.length);
    prompts.forEach((prompt, i) => cache.set(prompt, `answer ${i}`, 0));
    prompts.forEach((prompt, i) => expect(cache.get(prompt, 1)).toBe(`answer ${i}`));
    // The same household in another place is a different prompt too.
    const elsewhere = makeSnapshot({ place: { ...air.place, label: 'Lahore, Pakistan' } });
    const moved = buildPlanPrompt(buildPlan(DEFAULT_HOUSEHOLD, elsewhere, at), DEFAULT_HOUSEHOLD);
    expect(cache.get(moved, 1)).toBeNull();
  });
});

describe('explainPlan: caching validated AI plans', () => {
  const air = makeSnapshot();
  const at = new Date('2026-11-23T00:00:00Z');
  const plan = buildPlan(DEFAULT_HOUSEHOLD, air, at);
  const ai: AiPlan = {
    headline: 'Walk at 13:00, not at dawn.',
    summary: 'The lid traps smoke until noon.',
    items: [{ id: 'ventilate', why: 'Afternoon air is a third as dirty.' }],
    indoorHacks: [{ title: 'Wet-mop', detail: 'Dust resuspends PM.', impact: 'Less dust' }],
    sustainableSwaps: [{ title: 'Carpool', detail: 'Two people, one car.', impact: 'Less CO2' }],
  };
  const gemini = (generateContent: unknown): GenAiLike =>
    ({ models: { generateContent, generateContentStream: vi.fn() } }) as unknown as GenAiLike;
  const claude = (create: unknown) =>
    ({ messages: { create, stream: vi.fn() } }) as unknown as ClaudeLike;
  const answering = () => vi.fn().mockResolvedValue({ text: JSON.stringify(ai) });

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    clearPlanCache();
    setClaude(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setClient(undefined);
    setClaude(undefined);
    clearPlanCache();
  });

  it('pays for one generation, then serves identical prompts from the cache', async () => {
    const generateContent = answering();
    setClient(gemini(generateContent));
    const first = await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    const second = await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    expect(first?.data).toEqual(ai);
    expect(second).toEqual(first);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('serves a cached plan even when every provider has since gone away', async () => {
    setClient(gemini(answering()));
    const first = await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    setClient(null);
    await expect(explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline())).resolves.toEqual(first);
  });

  it('generates again for a different household', async () => {
    const generateContent = answering();
    setClient(gemini(generateContent));
    const other = { ...DEFAULT_HOUSEHOLD, name: 'Sharma family' };
    await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    await explainPlan(buildPlan(other, air, at), other, startDeadline());
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('generates again once the ten minutes are over', async () => {
    vi.useFakeTimers();
    const generateContent = answering();
    setClient(gemini(generateContent));
    await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    vi.advanceTimersByTime(PLAN_CACHE_TTL_MS - 1);
    await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    expect(generateContent).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('never caches a failure or a rules fallback: the next request asks the providers again', async () => {
    vi.useFakeTimers();
    const failing = vi.fn().mockRejectedValue(new Error('400 invalid argument'));
    setClient(gemini(failing));
    const failed = explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(failed).resolves.toBeNull();
    const generateContent = answering();
    setClient(gemini(generateContent));
    const recovered = await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    expect(recovered?.data).toEqual(ai);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('never caches an answer that failed validation', async () => {
    const invalid = vi.fn().mockResolvedValue({ text: JSON.stringify({ headline: 'only this' }) });
    vi.useFakeTimers();
    setClient(gemini(invalid));
    const rejected = explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(rejected).resolves.toBeNull();
    setClient(null);
    await expect(explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline())).resolves.toBeNull();
  });

  it('caches a plan written by Claude with its own model name', async () => {
    setClient(null);
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(ai) }],
    });
    setClaude(claude(create));
    const first = await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    const second = await explainPlan(plan, DEFAULT_HOUSEHOLD, startDeadline());
    expect(first?.model).toMatch(/^claude-/);
    expect(second).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
