import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MODES,
  N95_FACTOR,
  isTravelMode,
  rankModes,
  tripExposure,
  type TravelMode,
  type TripInput,
} from './commute';
import {
  BREATHING_RATE,
  SENSITIVITY,
  WHO_PM25_24H,
  cigarettesFromConcHours,
  cigarettesPerDay,
  inhaledDose,
  outdoorEffortLimit,
  sensitivityOf,
  type AgeGroup,
  type Condition,
} from './exposure';

/** Property tests for personal exposure maths and the commute trip model built on it. */

const RUNS = { numRuns: 200 };
const AGE_GROUPS: readonly AgeGroup[] = ['child', 'teen', 'adult', 'senior'];
const CONDITIONS: readonly Condition[] = ['asthma', 'copd', 'heart', 'pregnancy'];
const TRAVEL_MODES: readonly TravelMode[] = Object.keys(MODES).filter(isTravelMode);

const positive = (max: number) => fc.double({ min: 0, max, noNaN: true });
const ageGroupArb = fc.constantFrom(...AGE_GROUPS);
const conditionsArb = fc.uniqueArray(fc.constantFrom(...CONDITIONS), { maxLength: 4 });
const tripArb: fc.Arbitrary<TripInput> = fc.record({
  mode: fc.constantFrom(...TRAVEL_MODES),
  distanceKm: positive(100),
  ambientPm25: positive(1000),
  ageGroup: ageGroupArb,
  n95: fc.boolean(),
});

/** Equal up to floating-point noise, relative to the size of the numbers. */
function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected)),
  );
}

describe('inhaled dose properties', () => {
  it('scales linearly with time', () => {
    fc.assert(
      fc.property(
        positive(1000),
        positive(4),
        positive(24),
        positive(10),
        (conc, rate, hours, k) => {
          expectClose(inhaledDose(conc, rate, hours * k), inhaledDose(conc, rate, hours) * k);
        },
      ),
      RUNS,
    );
  });

  it('adds up over consecutive stretches of time', () => {
    fc.assert(
      fc.property(positive(1000), positive(4), positive(24), positive(24), (conc, rate, a, b) => {
        expectClose(
          inhaledDose(conc, rate, a + b),
          inhaledDose(conc, rate, a) + inhaledDose(conc, rate, b),
        );
      }),
      RUNS,
    );
  });

  it('is never negative, and zero when any factor is zero or negative', () => {
    const anyNumber = fc.double({ min: -1000, max: 1000, noNaN: true });
    fc.assert(
      fc.property(anyNumber, anyNumber, anyNumber, (conc, rate, hours) => {
        const dose = inhaledDose(conc, rate, hours);
        expect(dose).toBeGreaterThanOrEqual(0);
        if (conc <= 0 || rate <= 0 || hours <= 0) expect(dose).toBe(0);
      }),
      RUNS,
    );
  });

  it('counts cigarettes in proportion to concentration and time, never below zero', () => {
    fc.assert(
      fc.property(positive(1000), positive(10), (meanPm25, k) => {
        expectClose(cigarettesPerDay(meanPm25 * k), cigarettesPerDay(meanPm25) * k);
        expectClose(cigarettesFromConcHours(meanPm25 * 24), cigarettesPerDay(meanPm25));
        expect(cigarettesFromConcHours(-meanPm25)).toBe(0);
      }),
      RUNS,
    );
  });
});

describe('sensitivity properties', () => {
  it('never lowers sensitivity when a condition is added', () => {
    fc.assert(
      fc.property(
        ageGroupArb,
        conditionsArb,
        fc.constantFrom(...CONDITIONS),
        (age, conditions, extra) => {
          const before = sensitivityOf(age, conditions);
          expect(before).toBeGreaterThanOrEqual(SENSITIVITY[age]);
          expect(sensitivityOf(age, [...conditions, extra])).toBeGreaterThanOrEqual(before);
        },
      ),
      RUNS,
    );
  });

  it('keeps the outdoor limit between the WHO guideline and 55, lower for the more sensitive', () => {
    fc.assert(
      fc.property(positive(20), positive(20), (a, b) => {
        const [less, more] = a <= b ? [a, b] : [b, a];
        expect(outdoorEffortLimit(more)).toBeLessThanOrEqual(outdoorEffortLimit(less));
        expect(outdoorEffortLimit(more)).toBeGreaterThanOrEqual(WHO_PM25_24H);
        expect(outdoorEffortLimit(less)).toBeLessThanOrEqual(55);
      }),
      RUNS,
    );
  });
});

describe('trip exposure properties', () => {
  it('scales dose, cigarettes and CO2 linearly with the length of the trip', () => {
    fc.assert(
      fc.property(tripArb, positive(10), (trip, k) => {
        const one = tripExposure(trip);
        const scaled = tripExposure({ ...trip, distanceKm: trip.distanceKm * k });
        expectClose(scaled.doseUg, one.doseUg * k);
        expectClose(scaled.cigarettes, one.cigarettes * k);
        expectClose(scaled.co2Kg, one.co2Kg * k);
        expect(scaled.breathedPm25).toBe(one.breathedPm25);
      }),
      RUNS,
    );
  });

  it('never increases exposure with an N95, and cuts it by 70% on open modes only', () => {
    fc.assert(
      fc.property(tripArb, (trip) => {
        const bare = tripExposure({ ...trip, n95: false });
        const masked = tripExposure({ ...trip, n95: true });
        expect(masked.doseUg).toBeLessThanOrEqual(bare.doseUg);
        expect(masked.breathedPm25).toBeLessThanOrEqual(bare.breathedPm25);
        expect(masked.cigarettes).toBeLessThanOrEqual(bare.cigarettes);
        const factor = MODES[trip.mode].open ? N95_FACTOR : 1;
        expectClose(masked.doseUg, bare.doseUg * factor);
        // A mask changes what is breathed, not the trip.
        expect(masked.minutes).toBe(bare.minutes);
        expect(masked.co2Kg).toBe(bare.co2Kg);
      }),
      RUNS,
    );
  });

  it('matches the dose formula: breathed air times breathing rate times hours', () => {
    fc.assert(
      fc.property(tripArb, (trip) => {
        const spec = MODES[trip.mode];
        const result = tripExposure(trip);
        const hours = trip.distanceKm / spec.speedKmh;
        expectClose(
          result.doseUg,
          inhaledDose(result.breathedPm25, BREATHING_RATE[trip.ageGroup][spec.activity], hours),
        );
        expect(result.minutes).toBe(Math.round(hours * 60));
      }),
      RUNS,
    );
  });

  it('costs nothing for a zero-distance or negative-distance trip, in any air', () => {
    fc.assert(
      fc.property(tripArb, fc.double({ min: -100, max: 0, noNaN: true }), (trip, distanceKm) => {
        expect(tripExposure({ ...trip, distanceKm })).toMatchObject({
          minutes: 0,
          doseUg: 0,
          co2Kg: 0,
          cigarettes: 0,
        });
      }),
      RUNS,
    );
  });

  it('never lowers the dose when the street air gets dirtier', () => {
    fc.assert(
      fc.property(tripArb, positive(1000), (trip, extra) => {
        const dirtier = tripExposure({ ...trip, ambientPm25: trip.ambientPm25 + extra });
        expect(dirtier.doseUg).toBeGreaterThanOrEqual(tripExposure(trip).doseUg);
      }),
      RUNS,
    );
  });
});

describe('rankModes properties', () => {
  it('lists each mode at most once, best score first, with finite scores', () => {
    fc.assert(
      fc.property(tripArb, (trip) => {
        const options = rankModes(trip);
        const modes = options.map((o) => o.mode);
        expect(new Set(modes).size).toBe(modes.length);
        const scores = options.map((o) => o.score);
        expect(scores.every((s) => Number.isFinite(s) && s >= 0)).toBe(true);
        expect(scores).toEqual([...scores].sort((a, b) => a - b));
      }),
      RUNS,
    );
  });

  it('never offers a mode beyond its sensible range or far slower than the current one', () => {
    fc.assert(
      fc.property(tripArb, (trip) => {
        const limit = tripExposure(trip).minutes * 1.6 + 15;
        for (const option of rankModes(trip)) {
          expect(trip.distanceKm).toBeLessThanOrEqual(MODES[option.mode].maxKm);
          if (option.mode !== trip.mode) expect(option.minutes).toBeLessThanOrEqual(limit);
        }
      }),
      RUNS,
    );
  });

  it('always keeps the current mode in the running while the trip is within its range', () => {
    fc.assert(
      fc.property(tripArb, (trip) => {
        const kept = rankModes(trip).some((o) => o.mode === trip.mode);
        expect(kept).toBe(trip.distanceKm <= MODES[trip.mode].maxKm);
      }),
      RUNS,
    );
  });

  it('gives every open mode a mask, so no option breathes more than its unmasked trip', () => {
    fc.assert(
      fc.property(tripArb, (trip) => {
        for (const option of rankModes(trip)) {
          const bare = tripExposure({ ...trip, mode: option.mode, n95: false });
          const expected = MODES[option.mode].open ? bare.doseUg * N95_FACTOR : bare.doseUg;
          expectClose(option.doseUg, expected);
        }
      }),
      RUNS,
    );
  });
});
