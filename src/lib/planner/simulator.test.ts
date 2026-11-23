import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSEHOLD, type Household, type Member } from '@/lib/profile/schema';
import { SOURCE_RATE } from '@/lib/science/indoor';
import { makeHourly } from '@/test/fixtures';
import {
  OFFICE_FACTOR,
  SCHOOL_FACTOR,
  awayFactorAt,
  exerciseVenueAt,
  isSleepHour,
  isWithinHours,
  planMemberDay,
} from './memberDay';
import { baselineScenario, cloneScenario, nextIndexOfHour, type Scenario } from './scenario';
import { HORIZON_HOURS, Simulator, indoorSourceRate } from './simulator';

const hourly = makeHourly();
const NOW = 24;

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm',
    name: 'M',
    ageGroup: 'adult',
    conditions: [],
    daytime: 'home',
    exercise: 'none',
    exerciseHour: 6,
    exerciseMinutes: 45,
    ...overrides,
  };
}

function household(members: Member[], commute: Partial<Household['commute']> = {}): Household {
  const hh = structuredClone(DEFAULT_HOUSEHOLD);
  hh.members = members;
  hh.commute = { ...hh.commute, memberId: members[0]?.id ?? 'none', ...commute };
  return hh;
}

function baseline(hh: Household): Scenario {
  return baselineScenario(hh, hourly, NOW, NOW + HORIZON_HOURS);
}

describe('hour ranges', () => {
  it('handles ranges inside one day and ranges past midnight', () => {
    expect(isWithinHours(9, { start: 9, end: 18 })).toBe(true);
    expect(isWithinHours(18, { start: 9, end: 18 })).toBe(false);
    expect(isWithinHours(23, { start: 22, end: 6 })).toBe(true);
    expect(isWithinHours(3, { start: 22, end: 6 })).toBe(true);
    expect(isWithinHours(12, { start: 22, end: 6 })).toBe(false);
  });

  it('treats 23:00 to 07:00 as sleep', () => {
    expect([23, 0, 6].every(isSleepHour)).toBe(true);
    expect([7, 12, 22].some(isSleepHour)).toBe(false);
  });
});

describe('planMemberDay', () => {
  it('gives the commuter shifted trip hours that wrap around midnight', () => {
    const you = member({ id: 'you', daytime: 'office' });
    const hh = household([you], { mode: 'bus', departHour: 23, returnHour: 9, distanceKm: 10 });
    const day = planMemberDay(hh, you, { ...baseline(hh), departShift: 2 });
    expect(day.commute).toMatchObject({ depart: 1, ret: 11 });
    expect(day.work).toEqual({ start: 1, end: 11 });
    expect(day.commute?.legHours).toBeLessThanOrEqual(1);
  });

  it('has no commute when working from home or when someone else commutes', () => {
    const a = member({ id: 'a', daytime: 'office' });
    const b = member({ id: 'b', daytime: 'school' });
    const hh = household([a, b], { mode: 'wfh' });
    expect(planMemberDay(hh, a, baseline(hh)).commute).toBeNull();
    expect(planMemberDay(hh, a, baseline(hh)).work).toEqual({ start: 9, end: 18 });
    const other = household([a, b], { memberId: 'a', mode: 'car' });
    expect(planMemberDay(other, b, baseline(other)).commute).toBeNull();
    expect(planMemberDay(other, b, baseline(other)).school).toBe(true);
  });

  it('caps an exercise session at one hour and skips members who do not exercise', () => {
    const runner = member({ exercise: 'run', exerciseMinutes: 120 });
    const hh = household([runner]);
    expect(planMemberDay(hh, runner, baseline(hh)).exercise).toMatchObject({
      hours: 1,
      activity: 'vigorous',
    });
    const rester = member();
    const restHh = household([rester]);
    expect(planMemberDay(restHh, rester, baseline(restHh)).exercise).toBeNull();
  });
});

describe('where a member is', () => {
  const day = {
    commute: null,
    work: null,
    school: true,
    exercise: { slot: 30, hourOfDay: 6, hours: 0.5, activity: 'light' as const },
  };

  it('applies the school and office ratios only during their hours', () => {
    expect(awayFactorAt(day, 10)).toBe(SCHOOL_FACTOR);
    expect(awayFactorAt(day, 15)).toBeNull();
    expect(awayFactorAt({ ...day, work: { start: 9, end: 18 } }, 10)).toBe(OFFICE_FACTOR);
  });

  it('places exercise outdoors at its slot, or indoors at the usual hour', () => {
    expect(exerciseVenueAt(day.exercise, 30, 6)).toBe('outdoor');
    expect(exerciseVenueAt(day.exercise, 54, 6)).toBeNull();
    expect(exerciseVenueAt({ ...day.exercise, slot: 'indoor' }, 54, 6)).toBe('indoor');
    expect(exerciseVenueAt(null, 30, 6)).toBeNull();
  });
});

describe('scenario helpers', () => {
  it('finds the next index with a given hour of day', () => {
    expect(nextIndexOfHour(hourly, NOW, NOW + 24, 6)).toBe(30);
    expect(nextIndexOfHour(hourly, NOW, NOW + 3, 6)).toBeNull();
  });

  it('clones exercise slots so a trial never edits the baseline', () => {
    const hh = household([member({ exercise: 'walk' })]);
    const base = baseline(hh);
    const trial = cloneScenario(base);
    trial.exercise.m = 'indoor';
    expect(base.exercise.m).toBe(30);
  });
});

describe('Simulator', () => {
  it('only counts indoor sources at their hours', () => {
    const s = baseline(household([member()]));
    const coil = { ...s, coil: true, cookingRate: 0, heatingRate: 0 };
    expect(indoorSourceRate(2, coil)).toBe(SOURCE_RATE.mosquitoCoil);
    expect(indoorSourceRate(12, coil)).toBe(0);
    expect(indoorSourceRate(20, { ...coil, cookingRate: 1000, cookingCapture: 0.6 })).toBeCloseTo(
      400,
    );
  });

  it('clips the horizon to the data and treats missing readings as zero', () => {
    const sim = new Simulator(hourly.slice(0, 30), NOW, household([member()]));
    expect(sim.to).toBe(30);
    const gap = new Simulator([{ ...hourly[0]!, pm25: null }], 0, household([member()]));
    expect(gap.ambient(0)).toBe(0);
    expect(gap.ambient(5)).toBe(0);
  });

  it('lowers dose when outdoor exercise moves indoors in smog', () => {
    const walker = member({ exercise: 'walk', exerciseHour: 7 });
    const hh = household([walker]);
    const sim = new Simulator(hourly, NOW, hh);
    const base = baseline(hh);
    const outdoors = sim.memberExposure(walker, base);
    const indoors = sim.memberExposure(walker, { ...base, exercise: { m: 'indoor' } });
    expect(indoors.doseUg).toBeLessThan(outdoors.doseUg);
    expect(indoors.breathedM3).toBeCloseTo(outdoors.breathedM3);
  });

  it('lowers the dose of every member when a purifier runs', () => {
    const hh = household([member({ id: 'a' }), member({ id: 'b', ageGroup: 'child' })]);
    const sim = new Simulator(hourly, NOW, hh);
    const base = sim.household(baseline(hh));
    const filtered = sim.household({ ...baseline(hh), purifier: 'large' });
    for (const id of ['a', 'b']) {
      expect(filtered.get(id)!.doseUg).toBeLessThan(base.get(id)!.doseUg);
    }
  });
});
