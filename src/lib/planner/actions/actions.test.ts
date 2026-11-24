import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSEHOLD, type Household } from '@/lib/profile/schema';
import { makeHourly, makeSnapshot, winterPm25 } from '@/test/fixtures';
import { combine } from '../combine';
import { createPlanContext, type ActionProposal, type PlanContext } from '../context';
import { isSafeAlone } from '../guard';
import { commuteModeAction, commuteTimeAction } from './commute';
import { exerciseActions } from './exercise';
import { filtrationAction } from './filtration';
import { cleanCookingUpgrade, heatingUpgrade } from './fuel';
import { coilAction, cookingAction } from './homeSources';
import { collectProposals } from './registry';
import { lidAction, ventilateAction } from './weather';

const clone = (h: Household): Household => structuredClone(h);

/** The fixture's winter day with the PM2.5 of some local hours replaced. */
const dayWith = (pm25: Record<number, number>) =>
  makeSnapshot({ hourly: makeHourly(5, '2026-11-22', (h) => pm25[h] ?? winterPm25(h)) });

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
    const none = combine(ctx, proposals, () => false);
    expect(none.scenario).toEqual(ctx.baseline);
    expect(none.exposure).toBe(ctx.baseExposure);
    const coilOnly = combine(ctx, proposals, (id) => id === 'coil');
    expect(coilOnly.scenario).toEqual({ ...ctx.baseline, coil: false });
    expect([...coilOnly.applied]).toEqual(['coil']);
    const all = combine(ctx, proposals);
    expect(all.scenario.purifier).toBe('none');
    expect(all.applied.has('diy-filter')).toBe(false);
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

describe('weather actions: an airing hour that harms nobody', () => {
  // 15:00 is the cleanest hour, but the kid is back from school by then and was out at 08:00,
  // so airing at 15:00 only adds to the kid's day.
  const kidHomeAtCleanest = dayWith({ 15: 40 });

  it('passes over the cleanest hour when opening the windows then would cost someone', () => {
    const ctx = context(undefined, kidHomeAtCleanest);
    expect(ctx.hourly[ctx.clean?.start ?? 0]?.time).toMatch(/T15:00$/);
    const airing = ventilateAction(ctx);
    expect(airing?.item.time).toBe('13:00');
    expect(airing?.item.change?.after).toBe('Air out 13:00 to 14:00 · 70 µg/m³ outside');
    expect(airing && isSafeAlone(ctx, airing)).toBe(true);
  });

  it('uses the cleanest hour when nobody is home to pay for it', () => {
    const kidAtHome = context((hh) => (hh.members[1]!.daytime = 'home'), kidHomeAtCleanest);
    expect(ventilateAction(kidAtHome)?.item.time).toBe('15:00');
  });

  it('proposes nothing when no cleaner hour is safe for everyone', () => {
    // The household is only ever home in the afternoon, and airs while everyone is out.
    const ctx = context(
      (hh) => {
        hh.members = [{ ...hh.members[1]!, exercise: 'none' }];
        hh.commute = { ...hh.commute, mode: 'wfh', memberId: 'kid' };
        hh.home.airingHour = 9;
      },
      dayWith({ 9: 300, 10: 300, 11: 300, 12: 300, 13: 300 }),
    );
    expect(ventilateAction(ctx)).toBeNull();
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

describe('exercise actions: the best option that harms nobody', () => {
  const evening = (hh: Household) => {
    hh.members[2] = { ...hh.members[2]!, exerciseHour: 20 };
  };
  const nani = (ctx: PlanContext) =>
    exerciseActions(ctx).find((p) => p.item.id === 'exercise-nani');

  it('moves to the cleanest outdoor hour when indoors would be worse than staying', () => {
    // 20:00 is a cooking hour: the kitchen is smokier than the street, so not indoors.
    const walk = nani(context(evening));
    expect(walk?.item.title).toBe("Move Nani's walk from 20:00 to 13:00");
    expect(walk?.item.status).toBe('caution');
    expect(walk?.item.detail).toMatch(/still over that limit/);
    expect(walk?.item.impact.doseSavedUg).toBeGreaterThan(0);
    expect(walk?.item.impact.cigarettesAvoided).toBeGreaterThanOrEqual(0);
  });

  it('keeps the habit, and says why, when neither indoors nor another hour helps', () => {
    // A flat day: no hour is cleaner, and indoors at 20:00 means the kitchen.
    const flat = makeSnapshot({ hourly: makeHourly(5, '2026-11-22', () => 150) });
    const walk = nani(context(evening, flat));
    expect(walk?.item.title).toBe("No cleaner slot for Nani's 20:00 walk today");
    expect(walk?.item.status).toBe('caution');
    expect(walk?.apply).toBeUndefined();
    expect(walk?.item.impact.doseSavedUg).toBe(0);
  });

  it('keeps a habit inside the limit when the cleaner hour would strand them in smoke', () => {
    // 30 µg/m³ at 20:00 is fine for an adult; moving to the 20 µg/m³ hour would mean sitting in
    // the kitchen at 20:00 instead of being out.
    const mild = makeSnapshot({ hourly: makeHourly(5, '2026-11-22', (h) => (h === 13 ? 20 : 30)) });
    const [you] = exerciseActions(context((hh) => (hh.members[0]!.exerciseHour = 20), mild));
    expect(you?.item.title).toBe('Keep your 20:00 walk');
    expect(you?.item.status).toBe('go');
  });

  it('goes indoors when a clean hour exists but moving there would be no gain', () => {
    // 54 µg/m³ at 13:00 is inside the limit, yet swapping an hour at the office for an hour on
    // the street adds more concentration-hours than leaving 58 µg/m³ at 06:00 saves.
    const marginal = makeSnapshot({
      hourly: makeHourly(5, '2026-11-22', (h) => (h === 13 ? 54 : 58)),
    });
    const [you] = exerciseActions(context(undefined, marginal));
    expect(you?.item.title).toBe('Take your walk indoors today');
    expect(you?.item.detail).toMatch(/moving to the cleanest daylight hour simulates no better/);
    expect(you?.item.impact.doseSavedUg).toBeGreaterThan(0);
  });

  it('words a move from an hour inside the limit without calling it over the limit', () => {
    const mild = makeSnapshot({ hourly: makeHourly(5, '2026-11-22', (h) => (h === 13 ? 20 : 30)) });
    const [you] = exerciseActions(context(undefined, mild));
    expect(you?.item.title).toBe('Move your walk from 06:00 to 13:00');
    expect(you?.item.detail).toMatch(
      /^06:00 is forecast at 30 µg\/m³, inside your limit of 55 µg\/m³/,
    );
  });
});

describe('commute actions', () => {
  const earlyShift = (hh: Household) => {
    hh.commute = { ...hh.commute, departHour: 7, returnHour: 16 };
  };

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

  it('never proposes a mode that is worse on dose or on CO2e', () => {
    const modes = ['walk', 'cycle', 'metro', 'bus', 'auto', 'twoWheeler', 'car', 'ev'] as const;
    for (const mode of modes) {
      for (const hasN95 of [true, false]) {
        for (const distanceKm of [2, 8, 10, 25]) {
          const ctx = context((hh) => {
            hh.commute = { ...hh.commute, mode, hasN95, distanceKm };
          });
          const swap = commuteModeAction(ctx);
          const label = `${mode} ${distanceKm} km, N95 ${hasN95}`;
          expect(swap === null || isSafeAlone(ctx, swap), label).toBe(true);
          expect(swap?.item.impact.co2SavedKg ?? 0, label).toBeGreaterThanOrEqual(0);
          expect(swap?.item.impact.doseSavedUg ?? 0, label).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('skips a cleaner departure that makes the whole day worse', () => {
    // Leaving at 09:00, not 07:00, keeps the commuter home through the 08:00 cooking and airing.
    const ctx = context(earlyShift, dayWith({ 9: 100 }));
    expect(commuteTimeAction(ctx)).toBeNull();
  });

  it('falls back to the next cleanest departure that harms nobody', () => {
    const ctx = context(earlyShift, dayWith({ 9: 100, 6: 120 }));
    const leave = commuteTimeAction(ctx);
    expect(leave?.item.title).toBe('Leave at 06:00 instead of 07:00');
    expect(leave?.item.impact.doseSavedUg).toBeGreaterThan(0);
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
