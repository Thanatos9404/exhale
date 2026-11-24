import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  IN_TABLES,
  US_TABLES,
  aqiCategory,
  aqiSeries,
  computeAqi,
  hourlyAqi,
  subIndex,
  windowMean,
  type PollutantAverages,
} from './aqi';
import type { AqiStandard, HourPoint, Pollutant } from './types';

/** Property tests for the AQI maths, over both standards and every pollutant table. */

const RUNS = { numRuns: 200 };
const STANDARDS: readonly AqiStandard[] = ['us', 'in'];
const POLLUTANTS: readonly Pollutant[] = ['pm25', 'pm10', 'no2', 'o3'];
const tablesOf = (standard: AqiStandard) => (standard === 'us' ? US_TABLES : IN_TABLES);

const standardArb = fc.constantFrom(...STANDARDS);
const pollutantArb = fc.constantFrom(...POLLUTANTS);
/** A concentration in table units, reaching well past every table's last breakpoint. */
const concentrationArb = fc.double({ min: 0, max: 3000, noNaN: true });
/** Anything a broken feed could send: negatives, NaN, infinities, nothing at all. */
const messyValueArb = fc.option(fc.double(), { nil: null, freq: 5 });
const averagesArb = (value: fc.Arbitrary<number | null>): fc.Arbitrary<PollutantAverages> =>
  fc.record({ pm25: value, pm10: value, no2: value, o3: value });

describe('subIndex properties', () => {
  it('never falls as the concentration rises, in every table of both standards', () => {
    fc.assert(
      fc.property(
        standardArb,
        pollutantArb,
        concentrationArb,
        concentrationArb,
        (standard, pollutant, a, b) => {
          const table = tablesOf(standard)[pollutant];
          const [low, high] = a <= b ? [a, b] : [b, a];
          expect(subIndex(low, table)).toBeLessThanOrEqual(subIndex(high, table));
        },
      ),
      RUNS,
    );
  });

  it('is a whole number between 0 and the top of its table for any input at all', () => {
    fc.assert(
      fc.property(standardArb, pollutantArb, fc.double(), (standard, pollutant, value) => {
        const table = tablesOf(standard)[pollutant];
        const index = subIndex(value, table);
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(table.at(-1)!.ihi);
      }),
      RUNS,
    );
  });

  it('stays inside the index range of the band the concentration falls in', () => {
    fc.assert(
      fc.property(standardArb, pollutantArb, concentrationArb, (standard, pollutant, value) => {
        const table = tablesOf(standard)[pollutant];
        // A value in the gap between two bands belongs to the upper one.
        const band = table.find((b) => value <= b.chi) ?? table.at(-1)!;
        const index = subIndex(value, table);
        expect(index).toBeGreaterThanOrEqual(band.ilo);
        expect(index).toBeLessThanOrEqual(band.ihi);
      }),
      RUNS,
    );
  });
});

describe('AQI category properties', () => {
  it('names a band by its position in the breakpoint table, so edges agree', () => {
    fc.assert(
      fc.property(standardArb, pollutantArb, concentrationArb, (standard, pollutant, value) => {
        const table = tablesOf(standard)[pollutant];
        const position = table.findIndex((b) => value <= b.chi);
        const expected = position < 0 ? table.length - 1 : position;
        expect(aqiCategory(subIndex(value, table), standard).level).toBe(expected);
      }),
      RUNS,
    );
  });

  it('never drops to a milder category as the AQI rises', () => {
    fc.assert(
      fc.property(
        standardArb,
        fc.double({ noNaN: true }),
        fc.double({ noNaN: true }),
        (standard, a, b) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          expect(aqiCategory(low, standard).level).toBeLessThanOrEqual(
            aqiCategory(high, standard).level,
          );
        },
      ),
      RUNS,
    );
  });

  it('switches category exactly between one whole AQI value and the next', () => {
    fc.assert(
      fc.property(standardArb, fc.integer({ min: 0, max: 499 }), (standard, aqi) => {
        const step = aqiCategory(aqi + 1, standard).level - aqiCategory(aqi, standard).level;
        expect([0, 1]).toContain(step);
        // Nothing changes between two whole values.
        expect(aqiCategory(aqi + 0.5, standard)).toBe(aqiCategory(aqi + 1, standard));
      }),
      RUNS,
    );
  });
});

describe('computeAqi properties', () => {
  it('never goes below 0 or above 500, whatever the feed sends', () => {
    fc.assert(
      fc.property(standardArb, averagesArb(messyValueArb), (standard, averages) => {
        const { aqi, subIndices } = computeAqi(averages, standard);
        expect(Number.isInteger(aqi)).toBe(true);
        expect(aqi).toBeGreaterThanOrEqual(0);
        expect(aqi).toBeLessThanOrEqual(500);
        expect(Object.values(subIndices).every((v) => v >= 0 && v <= 500)).toBe(true);
      }),
      RUNS,
    );
  });

  it('is the worst sub-index, and names the pollutant that set it', () => {
    fc.assert(
      fc.property(standardArb, averagesArb(messyValueArb), (standard, averages) => {
        const { aqi, dominant, subIndices } = computeAqi(averages, standard);
        expect(aqi).toBe(Math.max(0, ...Object.values(subIndices)));
        if (aqi > 0) expect(subIndices[dominant]).toBe(aqi);
        // Only readings that are real numbers are scored.
        const scored = POLLUTANTS.filter((p) => Number.isFinite(averages[p] ?? Number.NaN));
        expect(Object.keys(subIndices).sort()).toEqual([...scored].sort());
      }),
      RUNS,
    );
  });

  it('never falls when one pollutant rises and the rest stay put', () => {
    const value = fc.option(fc.double({ min: 0, max: 3000, noNaN: true }), { nil: null });
    fc.assert(
      fc.property(
        standardArb,
        averagesArb(value),
        pollutantArb,
        fc.double({ min: 0, max: 3000, noNaN: true }),
        (standard, averages, pollutant, extra) => {
          const raised = { ...averages, [pollutant]: (averages[pollutant] ?? 0) + extra };
          expect(computeAqi(raised, standard).aqi).toBeGreaterThanOrEqual(
            computeAqi(averages, standard).aqi,
          );
        },
      ),
      RUNS,
    );
  });
});

describe('hourly series properties', () => {
  const seriesValue = fc.option(fc.double({ min: 0, max: 2000, noNaN: true }), {
    nil: null,
    freq: 4,
  });
  const hourArb: fc.Arbitrary<HourPoint> = fc.record({
    time: fc.constant('2026-11-23T00:00'),
    pm25: seriesValue,
    pm10: seriesValue,
    no2: seriesValue,
    o3: seriesValue,
    temp: fc.constant(null),
    wind: fc.constant(null),
    blh: fc.constant(null),
    rh: fc.constant(null),
  });

  it('averages to a value between the smallest and largest reading in the window', () => {
    fc.assert(
      fc.property(
        fc.array(seriesValue, { maxLength: 60 }),
        fc.integer({ min: -30, max: 70 }),
        fc.integer({ min: -30, max: 70 }),
        (values, from, to) => {
          const window = values
            .slice(Math.max(0, from), Math.max(0, to + 1))
            .filter((v) => v !== null);
          const mean = windowMean(values, from, to);
          if (window.length === 0) {
            expect(mean).toBeNull();
            return;
          }
          const tolerance = 1e-9 * Math.max(1, ...window);
          expect(mean).toBeGreaterThanOrEqual(Math.min(...window) - tolerance);
          expect(mean).toBeLessThanOrEqual(Math.max(...window) + tolerance);
        },
      ),
      RUNS,
    );
  });

  it('scores every hour of a series with gaps, and an hour with no readings as 0', () => {
    fc.assert(
      fc.property(standardArb, fc.array(hourArb, { maxLength: 60 }), (standard, hourly) => {
        const series = aqiSeries(hourly, standard);
        expect(series).toHaveLength(hourly.length);
        expect(series.every((r) => Number.isInteger(r.aqi) && r.aqi >= 0 && r.aqi <= 500)).toBe(
          true,
        );
        hourly.forEach((hour) => {
          const instant = hourlyAqi(hour, standard);
          const empty = POLLUTANTS.every((p) => hour[p] === null);
          expect(instant.aqi === 0 || !empty).toBe(true);
        });
      }),
      RUNS,
    );
  });

  it('matches the instant AQI when every hour of the averaging window is the same', () => {
    fc.assert(
      fc.property(
        standardArb,
        fc.record({
          pm25: fc.double({ min: 0, max: 600, noNaN: true }),
          pm10: fc.double({ min: 0, max: 900, noNaN: true }),
          no2: fc.double({ min: 0, max: 900, noNaN: true }),
          o3: fc.double({ min: 0, max: 900, noNaN: true }),
        }),
        fc.integer({ min: 1, max: 48 }),
        (standard, levels, hours) => {
          const hour: HourPoint = {
            time: '2026-11-23T00:00',
            ...levels,
            temp: null,
            wind: null,
            blh: null,
            rh: null,
          };
          const steady = Array.from({ length: hours }, () => hour);
          const last = aqiSeries(steady, standard).at(-1)!;
          // A mean of identical values can differ from the value in the last bit, which can
          // move a rounded sub-index by one.
          expect(Math.abs(last.aqi - hourlyAqi(hour, standard).aqi)).toBeLessThanOrEqual(1);
        },
      ),
      RUNS,
    );
  });
});
