import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSEHOLD, type Household } from '@/lib/profile/schema';
import { makeHourly, makeSnapshot } from '@/test/fixtures';
import { createPlanContext, type ActionProposal, type PlanContext } from '../context';
import { commuteModeAction, commuteTimeAction } from './commute';
import { exerciseActions } from './exercise';
import { filtrationAction } from './filtration';
import { cleanCookingUpgrade, heatingUpgrade } from './fuel';
import { coilAction, cookingAction } from './homeSources';
import { collectProposals, optimizedScenario } from './registry';
import { lidAction, ventilateAction } from './weather';

const clone = (h: Household): Household => structuredClone(h);

function context(edit: (hh: Household) => void = () => undefined, air = makeSnapshot()) {
  const hh = clone(DEFAULT_HOUSEHOLD);
  edit(hh);
  return createPlanContext(hh, air);
}

describe('registry', () => {
  const ctx = context();
  const proposals = collectProposals(ctx);

  it('lists proposals in builder order, one exercise item per exercising member', () => {
    expect(proposals.map((p) => p.item.id)).toEqual([
      'lid',
      'ventilate',
      'exercise-you',
      'exercise-kid',
      'exercise-nani',
      'commute',
      'commute-time',
      'coil',
      'incense',
      'cooking',
      'diy-filter',
    ]);
  });

  it('skips builders that return null and flattens lists', () => {
    const one = proposals[0]!;
    const custom = collectProposals(ctx, [() => null, () => one, () => [one, one]]);
    expect(custom).toEqual([one, one, one]);
  });

  it('applies only selected free actions that carry a change', () => {
    const none = optimizedScenario(ctx.baseline, proposals, () => false);
    expect(none).toEqual(ctx.baseline);
    const coilOnly = optimizedScenario(ctx.baseline, proposals, (id) => id === 'coil');
    expect(coilOnly).toEqual({ ...ctx.baseline, coil: false });
    const all = optimizedScenario(ctx.baseline, proposals, () => true);
    expect(all.purifier).toBe('none');
    expect(ctx.baseline.coil).toBe(true);
  });
});

describe('weather actions', () => {
  it('shuts windows through the longest lid, not the first', () => {
    const shortThenLong = makeHourly(5, '2026-11-22', undefined, (h) =>
      h === 2 || (h >= 18 && h <= 22) ? 30 : 1500,
    );
    const ctx = context(undefined, makeSnapshot({ hourly: shortThenLong }));
    expect(lidAction(ctx)?.item.time).toBe('18:00');
    expect(lidAction(ctx)?.item.endTime).toBe('23:00');
  });

  it('only moves airing when the new hour is meaningfully cleaner', () => {
    const flat = makeSnapshot({ hourly: makeHourly(5, '2026-11-22', () => 100) });
    expect(ventilateAction(context(undefined, flat))).toBeNull();
    expect(ventilateAction(context())?.apply).toBeDefined();
  });
});

describe('exercise actions', () => {
  it('explains a lower limit with the condition that sets it', () => {
    const [, kid] = exerciseActions(context());
    expect(kid?.item.detail).toMatch(/\(asthma\)/);
    expect(kid?.item.memberIds).toEqual(['kid']);
  });

  it('skips members who do not exercise', () => {
    const ids = exerciseActions(context((hh) => (hh.members[1]!.exercise = 'none'))).map(
      (p) => p.item.id,
    );
    expect(ids).toEqual(['exercise-you', 'exercise-nani']);
  });
});

describe('commute actions', () => {
  it('only suggests a new departure time for flexible hours', () => {
    expect(commuteTimeAction(context())?.item.title).toMatch(/^Leave at/);
    expect(commuteTimeAction(context((hh) => (hh.commute.flexible = false)))).toBeNull();
  });

  it('gives no commute advice to someone who does not travel', () => {
    const wfh = context((hh) => (hh.commute.mode = 'wfh'));
    const ghost = context((hh) => (hh.commute.memberId = 'nobody'));
    for (const ctx of [wfh, ghost]) {
      expect(commuteModeAction(ctx)).toBeNull();
      expect(commuteTimeAction(ctx)).toBeNull();
    }
  });

  it('counts both daily trips in the CO2 saving', () => {
    const swap = commuteModeAction(context());
    expect(swap?.item.impact.co2SavedKg).toBeGreaterThan(0);
    expect(swap?.item.change?.before).toMatch(/kg CO2e a day/);
  });
});

describe('home and upgrade actions', () => {
  const isUpgrade = (p: ActionProposal | null) => p?.item.freeAction === false && !p.apply;

  it('builds a box-fan filter as an upgrade, or runs an owned purifier for free', () => {
    expect(isUpgrade(filtrationAction(context()))).toBe(true);
    const owned = filtrationAction(context((hh) => (hh.home.purifier = 'small')));
    expect(owned.item.id).toBe('purifier');
    expect(owned.apply).toBeDefined();
  });

  it('words cooking advice for kitchens with and without a hood', () => {
    expect(cookingAction(context()).item.title).toMatch(/lids on/);
    expect(cookingAction(context((hh) => (hh.home.kitchenExhaust = true))).item.title).toMatch(
      /exhaust/,
    );
  });

  it('only flags sources the household actually has', () => {
    const clean = (ctx: PlanContext) =>
      [coilAction, heatingUpgrade, cleanCookingUpgrade].map((b) => b(ctx));
    const none = clean(context((hh) => (hh.home.mosquitoCoil = false)));
    expect(none).toEqual([null, null, null]);
    const smoky = clean(
      context((hh) => {
        hh.home.heating = 'wood';
        hh.home.cooking = 'biomass';
      }),
    );
    expect(smoky.slice(1).every(isUpgrade)).toBe(true);
  });
});
