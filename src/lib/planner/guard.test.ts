import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSEHOLD, type Household } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import { collectProposals } from './actions/registry';
import { combine, settle } from './combine';
import {
  advice,
  createPlanContext,
  freeAction,
  upgrade,
  type ActionProposal,
  type ItemDraft,
  type PlanContext,
} from './context';
import { buildPlan, type PlanResult } from './engine';
import { firstSafe, harmsNobody, isSafeAlone } from './guard';
import type { ScenarioChange } from './scenario';
import type { Exposure } from './simulator';
import { totalDose } from './totals';

const NOW = new Date('2026-11-23T00:00:00Z');

function household(edit: (hh: Household) => void = () => undefined): Household {
  const hh = structuredClone(DEFAULT_HOUSEHOLD);
  edit(hh);
  return hh;
}

const context = (edit?: (hh: Household) => void) =>
  createPlanContext(household(edit), makeSnapshot());

const draft = (id: string): ItemDraft => ({
  id,
  kind: 'home',
  status: 'go',
  time: null,
  endTime: null,
  title: id,
  detail: id,
});

const propose = (ctx: PlanContext, id: string, change: ScenarioChange, co2SavedKg = 0) =>
  freeAction(ctx, draft(id), change, { co2SavedKg });

const ids = (proposals: readonly ActionProposal[]) => proposals.map((p) => p.item.id);

/** Index of local hour `hod` in the fixture, whose "now" is 00:00 at index 24. */
const at = (hod: number) => 24 + hod;

const smokeIndoors: ScenarioChange = (s) => {
  s.smoking = true;
};
const dropTheCoil: ScenarioChange = (s) => {
  s.coil = false;
};
/** Airing at 17:00 (100 µg/m³ outside) instead of the usual 08:00 (210 µg/m³). */
const airAtFive: ScenarioChange = (s) => {
  s.airingIdx = at(17);
};
/** The kid's 17:00 cycle ride moved indoors. */
const kidIndoors: ScenarioChange = (s) => {
  s.exercise.kid = 'indoor';
};

describe('harmsNobody', () => {
  const day = (doseUg: number, concHours: number): Exposure => ({
    doseUg,
    concHours,
    breathedM3: 10,
  });
  const before = new Map([
    ['you', day(100, 50)],
    ['kid', day(80, 40)],
  ]);

  it('accepts a day that is equal or better for everyone', () => {
    expect(harmsNobody(before, before)).toBe(true);
    expect(harmsNobody(before, new Map([...before, ['kid', day(79, 40)]]))).toBe(true);
  });

  it('refuses a day that lowers the total by loading one member', () => {
    const shifted = new Map([
      ['you', day(10, 5)],
      ['kid', day(80.001, 40)],
    ]);
    expect(harmsNobody(before, shifted)).toBe(false);
  });

  it('refuses a lower dose bought with more concentration-hours, so signs cannot disagree', () => {
    expect(harmsNobody(before, new Map([...before, ['you', day(90, 50.001)]]))).toBe(false);
  });
});

describe('isSafeAlone', () => {
  const ctx = context();

  it('passes a change that helps and advice that changes nothing', () => {
    expect(isSafeAlone(ctx, propose(ctx, 'coil', dropTheCoil))).toBe(true);
    expect(isSafeAlone(ctx, advice(draft('lid'), ctx.everyone))).toBe(true);
    expect(
      isSafeAlone(
        ctx,
        propose(ctx, 'nothing', () => undefined),
      ),
    ).toBe(true);
  });

  it('refuses a change that raises a dose, as a free action or as an upgrade', () => {
    expect(isSafeAlone(ctx, propose(ctx, 'smoke', smokeIndoors))).toBe(false);
    expect(isSafeAlone(ctx, upgrade(ctx, draft('smoke'), smokeIndoors))).toBe(false);
  });

  it('refuses a change that raises CO2e, however much dose it saves', () => {
    const dirtier = propose(ctx, 'coil', dropTheCoil, -0.004);
    // Rounded for display the saving reads as zero; the verdict uses the unrounded figure.
    expect(Math.abs(dirtier.item.impact.co2SavedKg)).toBe(0);
    expect(dirtier.item.impact.doseSavedUg).toBeGreaterThan(0);
    expect(isSafeAlone(ctx, dirtier)).toBe(false);
  });

  it('judges the unrounded dose: a loss too small to show is still a loss', () => {
    const barelyWorse = propose(ctx, 'cooking', (s) => {
      s.cookingRate *= 1 + 1e-9;
    });
    expect(Math.abs(barelyWorse.item.impact.doseSavedUg)).toBe(0);
    expect(isSafeAlone(ctx, barelyWorse)).toBe(false);
  });
});

describe('firstSafe', () => {
  const ctx = context();

  it('returns the first candidate that passes and never simulates the ones after it', () => {
    const make = vi.fn((change: ScenarioChange) => propose(ctx, 'pick', change));
    const picked = firstSafe(ctx, [smokeIndoors, dropTheCoil, kidIndoors], make);
    expect(picked?.item.impact.doseSavedUg).toBe(668);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('returns null when nothing passes', () => {
    expect(firstSafe(ctx, [smokeIndoors], (c) => propose(ctx, 'pick', c))).toBeNull();
    expect(firstSafe(ctx, [], (c: ScenarioChange) => propose(ctx, 'pick', c))).toBeNull();
  });
});

describe('collectProposals: the gate every builder passes through', () => {
  const ctx = context();

  it('drops a harmful proposal whichever builder made it, and keeps the rest in order', () => {
    const kept = collectProposals(ctx, [
      () => propose(ctx, 'smoke', smokeIndoors),
      () => advice(draft('lid'), ctx.everyone),
      () => [propose(ctx, 'coil', dropTheCoil), propose(ctx, 'dirtier', dropTheCoil, -1)],
      () => upgrade(ctx, draft('worse-upgrade'), smokeIndoors),
    ]);
    expect(ids(kept)).toEqual(['lid', 'coil']);
  });

  it('keeps zero-impact protective advice', () => {
    const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), NOW);
    const lid = plan.items.find((i) => i.id === 'lid');
    expect(lid?.impact).toEqual({
      doseSavedUg: 0,
      exposureCutPct: 0,
      cigarettesAvoided: 0,
      co2SavedKg: 0,
    });
  });
});

describe('combine and settle: actions that only work apart', () => {
  // Each change helps on its own. Together the windows are open while the kid exercises inside.
  const ctx = context();
  const air = propose(ctx, 'air', airAtFive);
  const indoors = freeAction(ctx, draft('indoors'), kidIndoors, { memberIds: ['kid'] });

  it('starts from two proposals that are each safe alone', () => {
    expect(isSafeAlone(ctx, air)).toBe(true);
    expect(isSafeAlone(ctx, indoors)).toBe(true);
    expect(air.item.impact.doseSavedUg).toBeGreaterThan(0);
    expect(indoors.item.impact.doseSavedUg).toBeGreaterThan(0);
  });

  it('skips a step that would hurt someone given the steps before it', () => {
    const day = combine(ctx, [indoors, air]);
    expect([...day.applied]).toEqual(['indoors']);
    expect(day.scenario.airingIdx).toBe(ctx.baseline.airingIdx);
    expect(harmsNobody(ctx.baseExposure, day.exposure)).toBe(true);
    // Without the check the kid would breathe more than with `indoors` alone.
    const kidAlone = indoors.trial?.exposure.get('kid')?.doseUg ?? 0;
    const forced = ctx.simulate((s) => {
      kidIndoors(s);
      airAtFive(s);
    });
    expect(forced.get('kid')?.doseUg).toBeGreaterThan(kidAlone);
  });

  it('honours a what-if selection, and leaves the baseline untouched', () => {
    const before = structuredClone(ctx.baseline);
    expect([...combine(ctx, [indoors, air], (id) => id === 'air').applied]).toEqual(['air']);
    const none = combine(ctx, [indoors, air], () => false);
    expect(none.exposure).toBe(ctx.baseExposure);
    expect(ctx.baseline).toEqual(before);
  });

  it('does not list an action the full plan would skip', () => {
    expect(ids(settle(ctx, [indoors, air]))).toEqual(['indoors']);
  });

  it('does not list an action the full plan is better off without', () => {
    // In this order both steps are harmless one after the other, so both are taken...
    const both = combine(ctx, [air, indoors]);
    expect([...both.applied]).toEqual(['air', 'indoors']);
    // ...yet the household breathes less if the windows stay shut during the indoor ride.
    const withoutAir = combine(ctx, [air, indoors], (id) => id !== 'air');
    expect(totalDose(withoutAir.exposure)).toBeLessThan(totalDose(both.exposure));
    expect(ids(settle(ctx, [air, indoors]))).toEqual(['indoors']);
  });

  it('keeps everything when nothing interacts', () => {
    const coil = propose(ctx, 'coil', dropTheCoil);
    const lid = advice(draft('lid'), ctx.everyone);
    const filter = upgrade(ctx, draft('filter'), (s) => {
      s.purifier = 'diy';
    });
    expect(ids(settle(ctx, [lid, air, coil, filter]))).toEqual(['lid', 'air', 'coil', 'filter']);
  });
});

describe('regressions: recommendations that used to make the day worse', () => {
  const plan = (edit: (hh: Household) => void) => buildPlan(household(edit), makeSnapshot(), NOW);
  const item = (p: PlanResult, id: string) => p.items.find((i) => i.id === id);
  const worstFigure = (p: PlanResult) =>
    Math.min(
      ...p.items.flatMap(({ impact }) => [
        impact.doseSavedUg,
        impact.exposureCutPct,
        impact.cigarettesAvoided,
        impact.co2SavedKg,
      ]),
    );
  const without = (edit: (hh: Household) => void, dropped: string) => {
    const hh = household(edit);
    const all = buildPlan(hh, makeSnapshot(), NOW);
    const only = new Set(all.items.map((i) => i.id).filter((id) => id !== dropped));
    return buildPlan(hh, makeSnapshot(), NOW, { only });
  };

  it('does not send a walker indoors at 08:00, when the kitchen is smokier than the street', () => {
    // Used to be "Take your walk indoors today" with doseSavedUg -128.
    const morningWalk = (hh: Household) => {
      hh.members[0]!.exerciseHour = 8;
    };
    const p = plan(morningWalk);
    const walk = item(p, 'exercise-you');
    expect(walk?.title).toBe('No cleaner slot for your 08:00 walk today');
    expect(walk?.status).toBe('caution');
    expect(walk?.change).toBeUndefined();
    expect(walk?.impact.doseSavedUg).toBe(0);
    expect(p.items.some((i) => i.title.includes('your walk indoors'))).toBe(false);
    expect(worstFigure(p)).toBeGreaterThanOrEqual(0);
    // The old plan ended at 2,389 µg; without the harmful item it is 2,343 µg.
    expect(p.totals).toMatchObject({ baselineDoseUg: 3465, optimizedDoseUg: 2343 });
    expect(without(morningWalk, 'exercise-you').totals.optimizedDoseUg).toBe(2343);
    const you = p.members.find((m) => m.id === 'you');
    expect(you?.optimizedDoseUg).toBeLessThan(you?.baselineDoseUg ?? 0);
  });

  it('does not swap a masked cyclist onto a two-wheeler, which would add 0.88 kg CO2e a day', () => {
    const cyclist = (hh: Household) => {
      hh.commute = { ...hh.commute, mode: 'cycle', hasN95: true, distanceKm: 8 };
    };
    const p = plan(cyclist);
    // No ranked mode beats the cycle on both dose and CO2e, so the cycle is kept.
    expect(item(p, 'commute')).toBeUndefined();
    expect(p.items.some((i) => i.title.includes('two-wheeler'))).toBe(false);
    expect(p.totals.co2SavedKgDay).toBe(0);
    expect(p.totals.co2SavedKgWeek).toBe(0);
    expect(worstFigure(p)).toBeGreaterThanOrEqual(0);
  });

  it('does not swap a masked two-wheeler rider onto the metro for a higher dose', () => {
    // Used to report a dose of -4 µg next to +0.05 cigarettes avoided.
    const rider = (hh: Household) => {
      hh.commute = { ...hh.commute, mode: 'twoWheeler', hasN95: true, distanceKm: 10 };
    };
    const p = plan(rider);
    expect(item(p, 'commute')).toBeUndefined();
    expect(worstFigure(p)).toBeGreaterThanOrEqual(0);
    for (const { impact } of p.items) {
      expect(Math.sign(impact.doseSavedUg) * Math.sign(impact.cigarettesAvoided)).not.toBe(-1);
    }
    expect(p.totals.optimizedDoseUg).toBeLessThan(p.totals.baselineDoseUg);
  });

  it('still swaps the default petrol car for the metro, which wins on both counts', () => {
    const swap = item(buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), NOW), 'commute');
    expect(swap?.title).toBe('Swap the car (petrol) for the metro with an N95');
    expect(swap?.impact).toMatchObject({ doseSavedUg: 9, co2SavedKg: 3.89 });
  });
});
