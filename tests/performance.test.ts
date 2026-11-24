// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../src/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '../src/lib/profile/schema';
import { makeSnapshot } from '../src/test/fixtures';

/**
 * The planner has to be fast enough to rerun on every toggle and slider move. EFFICIENCY.md
 * quotes the time measured on a laptop; this budget is far looser so that a slow CI machine
 * never flakes, yet an accidental quadratic loop still fails the build.
 */

const BUDGET_MS = 15;
const RUNS = 100;

describe('planner performance budget', () => {
  it(`builds a full household plan in under ${BUDGET_MS} ms on average`, () => {
    const air = makeSnapshot();
    const now = new Date(air.current.time);
    for (let warmUp = 0; warmUp < 10; warmUp++) buildPlan(DEFAULT_HOUSEHOLD, air, now);

    const started = performance.now();
    for (let run = 0; run < RUNS; run++) buildPlan(DEFAULT_HOUSEHOLD, air, now);
    const meanMs = (performance.now() - started) / RUNS;

    expect(meanMs).toBeLessThan(BUDGET_MS);
  });

  it('scales linearly with household size, not quadratically', () => {
    const air = makeSnapshot();
    const now = new Date(air.current.time);
    // Eight people, the schema's maximum, cycling through the default members' habits.
    const members = Array.from({ length: 8 }, (_, index) => {
      const template = DEFAULT_HOUSEHOLD.members[index % DEFAULT_HOUSEHOLD.members.length];
      if (!template) throw new Error('The default household has no members');
      return { ...template, id: `m${index}` };
    });
    const large = {
      ...DEFAULT_HOUSEHOLD,
      members,
      commute: { ...DEFAULT_HOUSEHOLD.commute, memberId: 'm0' },
    };

    const started = performance.now();
    for (let run = 0; run < 20; run++) buildPlan(large, air, now);
    const meanMs = (performance.now() - started) / 20;

    expect(meanMs).toBeLessThan(BUDGET_MS * 4);
  });
});
