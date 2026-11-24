import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanResponse } from '@/lib/apiTypes';
import { buildPlan } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import { parseDone, parseHistory, todayKey, type Deployment } from './deploymentModel';

const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), new Date('2026-11-23T00:00:00Z'));
const response: PlanResponse = { plan, ai: null, source: 'rules', model: null };

const deployment = (patch: Partial<Deployment> = {}): Deployment => ({
  id: 'dep-1',
  at: '2026-11-23T08:00:00.000Z',
  placeLabel: 'New Delhi, India',
  cutPct: 31.4,
  source: 'rules',
  model: null,
  response,
  ...patch,
});

/** What the history looks like after a trip through localStorage. */
const stored = (history: unknown): unknown => JSON.parse(JSON.stringify(history));

describe('parseHistory', () => {
  it('reads back a stored history, plan and all', () => {
    const history = [
      deployment(),
      deployment({ id: 'dep-2', source: 'gemini', model: 'gemini-3.5-flash-lite' }),
      deployment({ id: 'dep-3', source: 'claude', model: 'claude-haiku-5-5' }),
    ];
    const parsed = parseHistory(stored(history))!;
    expect(parsed).toEqual(stored(history));
    expect(parsed[0]!.response.plan.items).toHaveLength(plan.items.length);
    expect(parseHistory([])).toEqual([]);
  });

  it('keeps at most eight deployments', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => deployment({ id: `dep-${i}` }));
    expect(parseHistory(stored(many(8)))).toHaveLength(8);
    expect(parseHistory(stored(many(9)))).toBeNull();
  });

  it('rejects anything that is not a list', () => {
    for (const raw of [null, undefined, 'history', 3, {}, deployment()]) {
      expect(parseHistory(raw)).toBeNull();
    }
  });

  it('rejects the history when an entry has a missing or mistyped field', () => {
    const broken: unknown[] = [
      { ...deployment(), id: 7 },
      { ...deployment(), at: undefined },
      { ...deployment(), cutPct: '31' },
      { ...deployment(), source: 'gpt' },
      { ...deployment(), model: undefined },
      { ...deployment(), placeLabel: null },
    ];
    for (const entry of broken) expect(parseHistory([deployment(), entry])).toBeNull();
  });

  it('rejects an entry whose response has no plan with items', () => {
    const responses: unknown[] = [
      undefined,
      null,
      'plan',
      {},
      { plan: null },
      { plan: {} },
      { plan: { items: 'none' } },
    ];
    for (const bad of responses) {
      expect(parseHistory([{ ...deployment(), response: bad }])).toBeNull();
    }
  });

  it('accepts a response with an empty plan, since only the item list is checked', () => {
    const empty = { ...deployment(), response: { plan: { items: [] } } };
    expect(parseHistory([empty])).toHaveLength(1);
  });
});

describe('done ticks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T10:15:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keys the day as an ISO date', () => {
    expect(todayKey()).toBe('2026-11-23');
    vi.setSystemTime(new Date('2026-12-01T00:00:00Z'));
    expect(todayKey()).toBe('2026-12-01');
  });

  it('reads back the ticks made today', () => {
    const done = parseDone({ day: '2026-11-23', ids: ['ventilate', 'exercise-kid'] });
    expect(done).toEqual(new Set(['ventilate', 'exercise-kid']));
    expect(parseDone({ day: '2026-11-23', ids: [] })).toEqual(new Set());
  });

  it('counts a repeated id once', () => {
    expect(parseDone({ day: todayKey(), ids: ['ventilate', 'ventilate'] })!.size).toBe(1);
  });

  it('drops the ticks of another day', () => {
    expect(parseDone({ day: '2026-11-22', ids: ['ventilate'] })).toBeNull();
    expect(parseDone({ day: '2026-11-24', ids: ['ventilate'] })).toBeNull();
    vi.setSystemTime(new Date('2026-11-24T00:00:01Z'));
    expect(parseDone({ day: '2026-11-23', ids: ['ventilate'] })).toBeNull();
  });

  it('rejects malformed or oversized ticks', () => {
    const day = todayKey();
    const tooMany = Array.from({ length: 41 }, (_, i) => `item-${i}`);
    const bad: unknown[] = [
      null,
      undefined,
      [],
      'done',
      { day },
      { ids: ['ventilate'] },
      { day, ids: 'ventilate' },
      { day, ids: [1, 2] },
      { day, ids: ['x'.repeat(41)] },
      { day, ids: tooMany },
      { day: 20261123, ids: [] },
    ];
    for (const raw of bad) expect(parseDone(raw)).toBeNull();
    expect(parseDone({ day, ids: tooMany.slice(0, 40) })!.size).toBe(40);
    expect(parseDone({ day, ids: ['x'.repeat(40)] })!.size).toBe(1);
  });
});
