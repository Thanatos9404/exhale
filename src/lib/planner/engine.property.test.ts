import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AirSnapshot, HourPoint } from '@/lib/air/types';
import { planResponseSchema, type PlanResponse } from '@/lib/apiTypes';
import {
  ageGroupSchema,
  commuteModeSchema,
  conditionSchema,
  daytimeSchema,
  exerciseSchema,
  householdSchema,
  type Household,
} from '@/lib/profile/schema';
import { buildPlan, HORIZON_HOURS, type PlanResult } from './engine';

/**
 * Property tests for the decision engine. Households are generated field by field from the
 * profile schema's own enums and ranges, then parsed with `householdSchema`, so every input is
 * one the app could really store. Air series are arbitrary but well-formed hourly forecasts,
 * with gaps.
 *
 * The do-no-harm properties at the end are the engine's central promise: no item reports a
 * negative saving, no member ends above their baseline whatever is selected, and no listed
 * action is one the plan would be better off without. They hold exactly, with no rounding
 * tolerance: the engine compares unrounded doses member by member, and rounding to a whole µg
 * is monotonic, so `optimised <= baseline` survives it.
 */

const NOW = new Date('2026-11-23T00:00:00Z');
const RUNS = { numRuns: 100 };
/** The do-no-harm properties get more runs: their counter-examples are rare interactions. */
const HARM_RUNS = { numRuns: 200 };
/**
 * The deselection property rebuilds the plan once per recommended action for every case, so it
 * gets its own time budget; it was run at 4,000 cases while the guard was developed.
 */
const DESELECT_TIMEOUT_MS = 90_000;

const hourOfDay = fc.integer({ min: 0, max: 23 });
const homeShape = householdSchema.shape.home.shape;

/** One member with a fixed id, so ids stay unique within a household. */
const memberArb = (id: string) =>
  fc.record({
    id: fc.constant(id),
    name: fc.constantFrom('You', 'Kid', 'Nani', "D'Souza", 'Mira-Bai', 'Ravi (Jr.)'),
    ageGroup: fc.constantFrom(...ageGroupSchema.options),
    conditions: fc.uniqueArray(fc.constantFrom(...conditionSchema.options), { maxLength: 4 }),
    daytime: fc.constantFrom(...daytimeSchema.options),
    exercise: fc.constantFrom(...exerciseSchema.options),
    exerciseHour: hourOfDay,
    exerciseMinutes: fc.integer({ min: 0, max: 240 }),
  });

/** Any household the profile schema accepts, from one member to five. */
const householdArb: fc.Arbitrary<Household> = fc
  .integer({ min: 1, max: 5 })
  .chain((size) => {
    const ids = ['you', 'kid', 'nani', 'member-4', 'member-5'].slice(0, size);
    return fc.record({
      version: fc.constant(1),
      name: fc.constantFrom('My household', 'Flat 4B', 'Sharma & family'),
      standard: fc.constantFrom(...householdSchema.shape.standard.unwrap().options),
      members: fc.tuple(...ids.map(memberArb)),
      commute: fc.record({
        memberId: fc.constantFrom(...ids),
        mode: fc.constantFrom(...commuteModeSchema.options),
        distanceKm: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 100, noNaN: true })),
        departHour: hourOfDay,
        returnHour: hourOfDay,
        daysPerWeek: fc.integer({ min: 0, max: 7 }),
        flexible: fc.boolean(),
        hasN95: fc.boolean(),
      }),
      home: fc.record({
        areaM2: fc.double({ min: 5, max: 200, noNaN: true }),
        ventilation: fc.constantFrom(...homeShape.ventilation.options),
        purifier: fc.constantFrom(...homeShape.purifier.options),
        airingHour: hourOfDay,
        cooking: fc.constantFrom(...homeShape.cooking.options),
        kitchenExhaust: fc.boolean(),
        heating: fc.constantFrom(...homeShape.heating.options),
        incense: fc.boolean(),
        mosquitoCoil: fc.boolean(),
        indoorSmoking: fc.boolean(),
      }),
    });
  })
  .map((raw) => householdSchema.parse(raw));

/** A reading that is sometimes missing, as the provider sends it. */
const reading = (max: number, min = 0) =>
  fc.option(fc.double({ min, max, noNaN: true }), { nil: null, freq: 8 });

const hourValuesArb = fc.record({
  pm25: reading(1000),
  pm10: reading(2000),
  no2: reading(1000),
  o3: reading(1000),
  temp: reading(50, -20),
  wind: reading(120),
  blh: reading(4000),
  rh: reading(100),
});

/** A snapshot around an hourly series, with the current reading taken from `nowIndex`. */
function snapshotOf(hourly: HourPoint[], nowIndex: number): AirSnapshot {
  const { blh: _blh, ...now } = hourly[nowIndex]!;
  return {
    place: { lat: 28.61, lon: 77.21, label: 'New Delhi, India', timezone: 'Asia/Kolkata' },
    fetchedAt: NOW.toISOString(),
    utcOffsetSeconds: 19_800,
    current: { ...now, so2: null, co: null, windDir: null, isDay: true },
    hourly,
    nowIndex,
  };
}

const hourlyTime = (startHour: number, i: number) =>
  new Date(Date.UTC(2026, 10, 22, startHour + i)).toISOString().slice(0, 16);

/** Consecutive local hours starting at any hour of the day, with "now" anywhere inside. */
const airArb: fc.Arbitrary<AirSnapshot> = fc
  .record({
    startHour: hourOfDay,
    hours: fc.array(hourValuesArb, { minLength: 1, maxLength: 72 }),
    nowFraction: fc.double({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ startHour, hours, nowFraction }) => {
    const hourly = hours.map((values, i) => ({ time: hourlyTime(startHour, i), ...values }));
    return snapshotOf(hourly, Math.min(hourly.length - 1, Math.floor(nowFraction * hourly.length)));
  });

/**
 * A full winter day with the shape real forecasts have: dirty nights under a low lid, a cleaner
 * afternoon, and hour-to-hour noise, always with 24 hours ahead of "now". The uniform `airArb`
 * almost never produces the near-ties between neighbouring hours in which two actions start to
 * interact, so the do-no-harm properties run on both kinds of day.
 */
const winterDayArb: fc.Arbitrary<AirSnapshot> = fc
  .record({
    night: fc.double({ min: 20, max: 300, noNaN: true }),
    afternoon: fc.double({ min: 0.2, max: 1.2, noNaN: true }),
    noise: fc.array(fc.double({ min: 0.8, max: 1.25, noNaN: true }), {
      minLength: 48,
      maxLength: 48,
    }),
    nowIndex: fc.integer({ min: 0, max: 23 }),
  })
  .map(({ night, afternoon, noise, nowIndex }) => {
    const hourly = noise.map((jitter, i) => {
      const isAfternoon = i % 24 >= 10 && i % 24 <= 17;
      const pm25 = night * (isAfternoon ? afternoon : 1) * jitter;
      const blh = isAfternoon ? 900 : 40;
      return {
        time: hourlyTime(0, i),
        pm25,
        pm10: pm25 * 1.6,
        no2: 40,
        o3: 30,
        temp: 14,
        wind: 4,
        blh,
        rh: 60,
      };
    });
    return snapshotOf(hourly, nowIndex);
  });

/** Any forecast: arbitrary and gappy, or shaped like a real winter day. */
const anyDayArb = fc.oneof(airArb, winterDayArb);

/** Every number anywhere inside a value, with the path that leads to it. */
function numbersIn(value: unknown, path = 'plan'): [string, number][] {
  if (typeof value === 'number') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbersIn(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbersIn(v, `${path}.${k}`));
  }
  return [];
}

const freeIds = (plan: PlanResult) => plan.items.filter((i) => i.freeAction).map((i) => i.id);

describe('buildPlan properties', () => {
  it('gives the same plan for the same inputs', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const first = buildPlan(household, air, NOW);
        const second = buildPlan(structuredClone(household), structuredClone(air), NOW);
        expect(second).toEqual(first);
      }),
      RUNS,
    );
  });

  it('never changes the household or the air data it is given', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const before = structuredClone({ household, air });
        buildPlan(household, air, NOW);
        expect({ household, air }).toEqual(before);
      }),
      RUNS,
    );
  });

  it('reports only finite numbers, whatever the forecast and its gaps', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const bad = numbersIn(buildPlan(household, air, NOW)).filter(
          ([, n]) => !Number.isFinite(n),
        );
        expect(bad).toEqual([]);
      }),
      RUNS,
    );
  });

  it('never reports a negative dose, cigarette count, budget, limit or AQI', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const plan = buildPlan(household, air, NOW);
        const { totals } = plan;
        const figures = [
          plan.risk.aqi,
          plan.lid.stagnantHours,
          plan.cleanWindow?.pm25 ?? 0,
          plan.worstWindow?.pm25 ?? 0,
          totals.baselineDoseUg,
          totals.optimizedDoseUg,
          ...plan.members.flatMap((m) => [
            m.budgetUg,
            m.baselineDoseUg,
            m.optimizedDoseUg,
            m.baselineCigarettes,
            m.optimizedCigarettes,
            m.pm25Limit,
          ]),
        ];
        expect(figures.filter((n) => n < 0)).toEqual([]);
      }),
      RUNS,
    );
  });

  it('summarises every member once, in household order, with totals that add up', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const plan = buildPlan(household, air, NOW);
        expect(plan.members.map((m) => m.id)).toEqual(household.members.map((m) => m.id));
        const sum = (pick: (m: PlanResult['members'][number]) => number) =>
          plan.members.reduce((total, m) => total + pick(m), 0);
        // Each member is rounded to a whole µg, so the sum can drift by half a µg per member.
        const slack = plan.members.length / 2 + 0.5;
        expect(
          Math.abs(sum((m) => m.baselineDoseUg) - plan.totals.baselineDoseUg),
        ).toBeLessThanOrEqual(slack);
        expect(
          Math.abs(sum((m) => m.optimizedDoseUg) - plan.totals.optimizedDoseUg),
        ).toBeLessThanOrEqual(slack);
      }),
      RUNS,
    );
  });

  it('gives every item a unique id, real members, and free actions before upgrades', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const plan = buildPlan(household, air, NOW);
        const ids = plan.items.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
        const memberIds = new Set(household.members.map((m) => m.id));
        for (const item of plan.items) {
          expect(item.memberIds.length).toBeGreaterThan(0);
          expect(item.memberIds.every((id) => memberIds.has(id))).toBe(true);
        }
        const firstUpgrade = plan.items.findIndex((i) => !i.freeAction);
        const lastFree = plan.items.findLastIndex((i) => i.freeAction);
        if (firstUpgrade >= 0) expect(lastFree).toBeLessThan(firstUpgrade);
        const saved = plan.items.filter((i) => i.freeAction).map((i) => i.impact.doseSavedUg);
        expect(saved).toEqual([...saved].sort((a, b) => b - a));
      }),
      RUNS,
    );
  });

  it('never claims to save more than the affected members inhale', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const plan = buildPlan(household, air, NOW);
        const baseline = new Map(plan.members.map((m) => [m.id, m.baselineDoseUg]));
        for (const { impact, memberIds } of plan.items) {
          const inhaled = memberIds.reduce((sum, id) => sum + (baseline.get(id) ?? 0), 0);
          expect(impact.exposureCutPct).toBeLessThanOrEqual(100);
          // Whole-µg rounding of each member and of the saving itself.
          expect(impact.doseSavedUg).toBeLessThanOrEqual(inhaled + memberIds.length / 2 + 0.5);
        }
        expect(plan.totals.exposureCutPct).toBeLessThanOrEqual(100);
      }),
      RUNS,
    );
  });

  it('never lowers a baseline dose when the forecast gets dirtier, nor moves the WHO budget', () => {
    fc.assert(
      fc.property(
        householdArb,
        airArb,
        fc.double({ min: 1, max: 10, noNaN: true }),
        (household, air, factor) => {
          const hourly = air.hourly.map((h) => ({
            ...h,
            pm25: h.pm25 === null ? null : h.pm25 * factor,
          }));
          const before = buildPlan(household, air, NOW).members;
          const after = buildPlan(household, { ...air, hourly }, NOW).members;
          after.forEach((member, i) => {
            expect(member.baselineDoseUg).toBeGreaterThanOrEqual(before[i]?.baselineDoseUg ?? 0);
            // The budget is the same schedule breathed in WHO-guideline air.
            expect(member.budgetUg).toBe(before[i]?.budgetUg);
          });
        },
      ),
      RUNS,
    );
  });

  it('simulates at most the next 24 hours and never reads past the series', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const plan = buildPlan(household, air, NOW);
        expect(plan.lid.stagnantHours).toBeLessThanOrEqual(
          Math.min(HORIZON_HOURS, air.hourly.length - air.nowIndex),
        );
        expect(plan.horizon.start).toBe(`${air.hourly[air.nowIndex]?.time.slice(11, 13)}:00`);
      }),
      RUNS,
    );
  });
});

describe('buildPlan what-if properties', () => {
  it('leaves every member exactly at baseline when no action is selected', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const plan = buildPlan(household, air, NOW, { only: new Set() });
        for (const m of plan.members) {
          expect(m.optimizedDoseUg).toBe(m.baselineDoseUg);
          expect(m.optimizedCigarettes).toBe(m.baselineCigarettes);
        }
        expect(plan.totals).toMatchObject({
          optimizedDoseUg: plan.totals.baselineDoseUg,
          exposureCutPct: 0,
          cigarettesAvoided: 0,
          co2SavedKgDay: 0,
          co2SavedKgWeek: 0,
        });
      }),
      RUNS,
    );
  });

  it('treats selecting every free action the same as selecting nothing in particular', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const all = buildPlan(household, air, NOW);
        const explicit = buildPlan(household, air, NOW, { only: new Set(freeIds(all)) });
        expect(explicit).toEqual(all);
      }),
      RUNS,
    );
  });

  it('keeps the baseline, the items and their impacts independent of the selection', () => {
    fc.assert(
      fc.property(
        householdArb,
        airArb,
        fc.infiniteStream(fc.boolean()),
        (household, air, picks) => {
          const all = buildPlan(household, air, NOW);
          const only = new Set(freeIds(all).filter(() => picks.next().value));
          const some = buildPlan(household, air, NOW, { only });
          expect(some.items).toEqual(all.items);
          expect(some.totals.baselineDoseUg).toBe(all.totals.baselineDoseUg);
          expect(some.members.map((m) => m.baselineDoseUg)).toEqual(
            all.members.map((m) => m.baselineDoseUg),
          );
          // Upgrades are never part of the optimised day, selected or not.
          const upgrades = new Set(all.items.filter((i) => !i.freeAction).map((i) => i.id));
          expect(buildPlan(household, air, NOW, { only: upgrades }).totals.optimizedDoseUg).toBe(
            all.totals.baselineDoseUg,
          );
        },
      ),
      RUNS,
    );
  });

  it('saves, for one action selected alone, exactly what that action reports', () => {
    fc.assert(
      fc.property(householdArb, airArb, fc.nat(), (household, air, pick) => {
        const all = buildPlan(household, air, NOW);
        const free = all.items.filter((i) => i.freeAction);
        const item = free[pick % Math.max(1, free.length)];
        if (!item) return;
        const alone = buildPlan(household, air, NOW, { only: new Set([item.id]) }).totals;
        const saved = alone.baselineDoseUg - alone.optimizedDoseUg;
        // Three roundings to a whole µg separate the two figures.
        expect(Math.abs(saved - item.impact.doseSavedUg)).toBeLessThanOrEqual(1);
        expect(alone.co2SavedKgDay).toBeCloseTo(item.impact.co2SavedKg, 10);
      }),
      RUNS,
    );
  });
});

describe('source-control and filtration actions', () => {
  /** Coil, incense, smoking, cooking and an owned purifier: each only ever cleans the home air. */
  const homeIds = (plan: PlanResult) =>
    plan.items.filter((i) => i.freeAction && i.kind === 'home').map((i) => i.id);

  it('never raise any member above their baseline dose', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const all = buildPlan(household, air, NOW);
        const plan = buildPlan(household, air, NOW, { only: new Set(homeIds(all)) });
        for (const m of plan.members) {
          expect(m.optimizedDoseUg).toBeLessThanOrEqual(m.baselineDoseUg);
          expect(m.optimizedCigarettes).toBeLessThanOrEqual(m.baselineCigarettes);
        }
        for (const item of all.items.filter((i) => i.kind === 'home')) {
          expect(item.impact.doseSavedUg).toBeGreaterThanOrEqual(0);
          expect(item.impact.cigarettesAvoided).toBeGreaterThanOrEqual(0);
        }
      }),
      RUNS,
    );
  });

  it('never save more as a subset than all of them together', () => {
    fc.assert(
      fc.property(
        householdArb,
        airArb,
        fc.infiniteStream(fc.boolean()),
        (household, air, picks) => {
          const ids = homeIds(buildPlan(household, air, NOW));
          const subset = new Set(ids.filter(() => picks.next().value));
          const some = buildPlan(household, air, NOW, { only: subset });
          const every = buildPlan(household, air, NOW, { only: new Set(ids) });
          expect(some.totals.optimizedDoseUg).toBeGreaterThanOrEqual(every.totals.optimizedDoseUg);
          some.members.forEach((m, i) => {
            expect(m.optimizedDoseUg).toBeGreaterThanOrEqual(
              every.members[i]?.optimizedDoseUg ?? 0,
            );
          });
        },
      ),
      RUNS,
    );
  });
});

describe('do-no-harm properties', () => {
  const total = (plan: PlanResult) => plan.totals.optimizedDoseUg;

  it('never raises any member above their baseline dose', () => {
    fc.assert(
      fc.property(householdArb, anyDayArb, (household, air) => {
        const plan = buildPlan(household, air, NOW);
        for (const m of plan.members) {
          expect(m.optimizedDoseUg).toBeLessThanOrEqual(m.baselineDoseUg);
          expect(m.optimizedCigarettes).toBeLessThanOrEqual(m.baselineCigarettes);
        }
        expect(total(plan)).toBeLessThanOrEqual(plan.totals.baselineDoseUg);
        expect(plan.totals.exposureCutPct).toBeGreaterThanOrEqual(0);
        expect(plan.totals.cigarettesAvoided).toBeGreaterThanOrEqual(0);
        expect(plan.totals.co2SavedKgDay).toBeGreaterThanOrEqual(0);
      }),
      HARM_RUNS,
    );
  });

  it('gives every item a dose, cigarette and CO2e saving of at least zero', () => {
    fc.assert(
      fc.property(householdArb, anyDayArb, (household, air) => {
        for (const { id, impact } of buildPlan(household, air, NOW).items) {
          expect(impact.doseSavedUg, `${id} dose`).toBeGreaterThanOrEqual(0);
          expect(impact.exposureCutPct, `${id} cut`).toBeGreaterThanOrEqual(0);
          expect(impact.cigarettesAvoided, `${id} cigarettes`).toBeGreaterThanOrEqual(0);
          expect(impact.co2SavedKg, `${id} CO2e`).toBeGreaterThanOrEqual(0);
        }
      }),
      HARM_RUNS,
    );
  });

  it('never ends above the baseline for any subset of free actions', () => {
    fc.assert(
      fc.property(
        householdArb,
        anyDayArb,
        fc.infiniteStream(fc.boolean()),
        (household, air, picks) => {
          const only = new Set(
            freeIds(buildPlan(household, air, NOW)).filter(() => picks.next().value),
          );
          const plan = buildPlan(household, air, NOW, { only });
          expect(total(plan)).toBeLessThanOrEqual(plan.totals.baselineDoseUg);
          expect(plan.totals.co2SavedKgDay).toBeGreaterThanOrEqual(0);
          // Stronger than the household total: no single member pays for the selection either.
          for (const m of plan.members) {
            expect(m.optimizedDoseUg).toBeLessThanOrEqual(m.baselineDoseUg);
            expect(m.optimizedCigarettes).toBeLessThanOrEqual(m.baselineCigarettes);
          }
        },
      ),
      HARM_RUNS,
    );
  });

  it(
    'never does better when any single recommended action is deselected',
    () => {
      // Actions interact (airing can land on an indoor exercise hour, a cleaner kitchen shrinks
      // what leaving the house saved), so an action that helps alone could drag the full plan
      // down. The engine settles the list until none does, which makes the strict statement true.
      fc.assert(
        fc.property(householdArb, anyDayArb, (household, air) => {
          const all = buildPlan(household, air, NOW);
          const ids = freeIds(all);
          for (const dropped of ids) {
            const only = new Set(ids.filter((id) => id !== dropped));
            const without = buildPlan(household, air, NOW, { only });
            expect(total(without), `without ${dropped}`).toBeGreaterThanOrEqual(total(all));
          }
        }),
        HARM_RUNS,
      );
    },
    DESELECT_TIMEOUT_MS,
  );

  it('counts every listed free action in the full plan, never a saving it does not deliver', () => {
    fc.assert(
      fc.property(householdArb, anyDayArb, (household, air) => {
        const all = buildPlan(household, air, NOW);
        // If any listed action were skipped as clashing, its CO2e would be missing here.
        const listed = all.items
          .filter((i) => i.freeAction)
          .reduce((sum, i) => sum + i.impact.co2SavedKg, 0);
        expect(all.totals.co2SavedKgDay).toBeCloseTo(listed, 6);
      }),
      HARM_RUNS,
    );
  });
});

describe('plan responses over the wire', () => {
  it('accepts every plan the engine builds after a trip through JSON', () => {
    fc.assert(
      fc.property(householdArb, airArb, (household, air) => {
        const response: PlanResponse = {
          plan: buildPlan(household, air, NOW),
          ai: null,
          source: 'rules',
          model: null,
        };
        const wire: unknown = JSON.parse(JSON.stringify(response));
        expect(planResponseSchema.parse(wire)).toEqual(wire);
      }),
      RUNS,
    );
  });
});
