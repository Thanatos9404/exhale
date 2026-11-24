import { describe, expect, it } from 'vitest';
import { buildPlan, type MemberSummary } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import { budgetPercent, buildSelectedPlan, diffItems, enabledFreeActions } from './plans';

const air = makeSnapshot();
const plan = buildPlan(DEFAULT_HOUSEHOLD, air, new Date('2026-11-23T00:00:00Z'));
const freeIds = plan.items.filter((i) => i.freeAction).map((i) => i.id);
const NONE: ReadonlySet<string> = new Set();

describe('the plan these tests rely on', () => {
  it('has free actions, upgrades, and free actions with and without a diff', () => {
    expect(freeIds.length).toBeGreaterThan(1);
    expect(plan.items.some((i) => !i.freeAction)).toBe(true);
    expect(plan.items.some((i) => i.freeAction && i.change)).toBe(true);
    expect(plan.totals.optimizedDoseUg).toBeLessThan(plan.totals.baselineDoseUg);
  });
});

describe('diffItems', () => {
  it('keeps the free actions that carry a before and after, in plan order', () => {
    const diffs = diffItems(plan);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs).toEqual(plan.items.filter((i) => diffs.includes(i as (typeof diffs)[number])));
    for (const item of diffs) {
      expect(item.freeAction).toBe(true);
      expect(item.change.before.length).toBeGreaterThan(0);
      expect(item.change.after.length).toBeGreaterThan(0);
    }
  });

  it('leaves out upgrades and actions without a diff', () => {
    const ids = new Set(diffItems(plan).map((i) => i.id));
    for (const item of plan.items) {
      expect(ids.has(item.id)).toBe(item.freeAction && item.change !== undefined);
    }
    const upgradeWithDiff = {
      ...plan.items[0]!,
      freeAction: false,
      change: { before: 'a', after: 'b' },
    };
    expect(diffItems({ ...plan, items: [upgradeWithDiff] })).toEqual([]);
    expect(diffItems({ ...plan, items: [] })).toEqual([]);
  });
});

describe('enabledFreeActions', () => {
  it('is every free action when nothing is switched off', () => {
    expect([...enabledFreeActions(plan, NONE)]).toEqual(freeIds);
  });

  it('drops the actions that are switched off and ignores unknown ids', () => {
    const [first, ...rest] = freeIds;
    expect([...enabledFreeActions(plan, new Set([first!, 'no-such-action']))]).toEqual(rest);
    expect(enabledFreeActions(plan, new Set(freeIds)).size).toBe(0);
  });

  it('never includes an upgrade, switched off or not', () => {
    const upgrades = plan.items.filter((i) => !i.freeAction).map((i) => i.id);
    const enabled = enabledFreeActions(plan, NONE);
    for (const id of upgrades) expect(enabled.has(id)).toBe(false);
  });
});

describe('buildSelectedPlan', () => {
  it('matches the full plan when every free action stays on', () => {
    const selected = buildSelectedPlan(DEFAULT_HOUSEHOLD, air, plan, NONE);
    expect(selected.totals).toEqual(plan.totals);
    expect(selected.members).toEqual(plan.members);
    expect(selected.items.map((i) => i.id)).toEqual(plan.items.map((i) => i.id));
  });

  it('is the unchanged day when every free action is switched off', () => {
    const selected = buildSelectedPlan(DEFAULT_HOUSEHOLD, air, plan, new Set(freeIds));
    expect(selected.totals.optimizedDoseUg).toBeCloseTo(plan.totals.baselineDoseUg, 6);
    expect(selected.totals.exposureCutPct).toBeCloseTo(0, 6);
    expect(selected.totals.co2SavedKgDay).toBe(0);
    for (const member of selected.members) {
      expect(member.optimizedDoseUg).toBeCloseTo(member.baselineDoseUg, 6);
    }
  });

  it('never lowers the dose by switching one action off', () => {
    for (const id of freeIds) {
      const selected = buildSelectedPlan(DEFAULT_HOUSEHOLD, air, plan, new Set([id]));
      expect(selected.totals.optimizedDoseUg).toBeGreaterThanOrEqual(
        plan.totals.optimizedDoseUg - 1e-6,
      );
      expect(selected.totals.baselineDoseUg).toBeCloseTo(plan.totals.baselineDoseUg, 6);
    }
  });
});

describe('budgetPercent', () => {
  const member = (optimizedDoseUg: number, budgetUg: number): MemberSummary => ({
    ...plan.members[0]!,
    optimizedDoseUg,
    budgetUg,
  });

  it('is the optimised dose as a share of the WHO budget', () => {
    expect(budgetPercent(member(150, 100))).toBe(150);
    expect(budgetPercent(member(40, 160))).toBe(25);
    expect(budgetPercent(member(0, 160))).toBe(0);
    for (const m of plan.members) {
      expect(budgetPercent(m)).toBeCloseTo((m.optimizedDoseUg / m.budgetUg) * 100, 9);
    }
  });

  it('stays finite when the budget is zero', () => {
    expect(budgetPercent(member(12, 0))).toBe(1200);
    expect(budgetPercent(member(0, 0))).toBe(0);
  });
});
