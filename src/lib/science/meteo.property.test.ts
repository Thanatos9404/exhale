import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HourPoint } from '../air/types';
import {
  cleanestWindow,
  dirtiestWindow,
  dispersionClass,
  fmtHour,
  hourOf,
  isLidHour,
  lidSpans,
  ventilationCoefficient,
} from './meteo';

/** Property tests for the smog meteorology helpers, over hourly series with gaps. */

const RUNS = { numRuns: 200 };

const reading = (max: number) =>
  fc.option(fc.double({ min: 0, max, noNaN: true }), { nil: null, freq: 5 });

/** Consecutive hours from an arbitrary hour of the day; only the fields meteo reads vary. */
const hourlyArb: fc.Arbitrary<HourPoint[]> = fc
  .tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.array(fc.record({ pm25: reading(1000), blh: reading(2000), wind: reading(40) }), {
      maxLength: 60,
    }),
  )
  .map(([startHour, hours]) =>
    hours.map((values, i) => ({
      time: new Date(Date.UTC(2026, 10, 22, startHour + i)).toISOString().slice(0, 16),
      ...values,
      pm10: null,
      no2: null,
      o3: null,
      temp: null,
      rh: null,
    })),
  );

/** A series plus a slice of it that may start before, or end after, the data. */
const sliceArb = fc.record({
  hourly: hourlyArb,
  from: fc.integer({ min: -5, max: 65 }),
  to: fc.integer({ min: -5, max: 65 }),
  duration: fc.integer({ min: 1, max: 6 }),
});

/** Every run of `duration` hours that fits inside the slice and the series. */
function runsIn(hourly: readonly HourPoint[], from: number, to: number, duration: number) {
  const runs: { start: number; hours: HourPoint[] }[] = [];
  for (let start = Math.max(0, from); start + duration <= Math.min(hourly.length, to); start++) {
    runs.push({ start, hours: hourly.slice(start, start + duration) });
  }
  return runs;
}

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

describe('window properties', () => {
  it('finds a cleanest window that fits the slice and beats every other complete run', () => {
    fc.assert(
      fc.property(sliceArb, ({ hourly, from, to, duration }) => {
        const complete = runsIn(hourly, from, to, duration)
          .map((run) => run.hours.map((h) => h.pm25))
          .filter((values) => values.every((v) => v !== null));
        const best = cleanestWindow(hourly, from, to, { duration });
        if (complete.length === 0) {
          expect(best).toBeNull();
          return;
        }
        expect(best).not.toBeNull();
        expect(best!.start).toBeGreaterThanOrEqual(Math.max(0, from));
        expect(best!.end).toBe(best!.start + duration);
        expect(best!.end).toBeLessThanOrEqual(Math.min(hourly.length, to));
        const lowest = Math.min(...complete.map(mean));
        expect(best!.meanPm25).toBeCloseTo(lowest, 6);
      }),
      RUNS,
    );
  });

  it('only starts a cleanest window inside the allowed hours of the day', () => {
    fc.assert(
      fc.property(
        sliceArb,
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        ({ hourly, from, to, duration }, dayStart, dayEnd) => {
          const best = cleanestWindow(hourly, from, to, { duration, dayStart, dayEnd });
          if (!best) return;
          const startHour = hourOf(hourly[best.start]!.time);
          expect(startHour).toBeGreaterThanOrEqual(dayStart);
          expect(startHour).toBeLessThanOrEqual(dayEnd);
          // Narrowing the hours can never find cleaner air than searching the whole day.
          const anyHour = cleanestWindow(hourly, from, to, { duration });
          expect(anyHour!.meanPm25).toBeLessThanOrEqual(best.meanPm25);
        },
      ),
      RUNS,
    );
  });

  it('finds a dirtiest window that is never cleaner than the cleanest one', () => {
    fc.assert(
      fc.property(sliceArb, ({ hourly, from, to, duration }) => {
        const worst = dirtiestWindow(hourly, from, to, duration);
        const best = cleanestWindow(hourly, from, to, { duration });
        const anyReading = runsIn(hourly, from, to, duration).some((run) =>
          run.hours.some((h) => h.pm25 !== null),
        );
        expect(worst !== null).toBe(anyReading);
        if (!worst) return;
        expect(worst.start).toBeGreaterThanOrEqual(Math.max(0, from));
        expect(worst.end).toBeLessThanOrEqual(Math.min(hourly.length, to));
        if (best) expect(worst.meanPm25).toBeGreaterThanOrEqual(best.meanPm25 - 1e-9);
      }),
      RUNS,
    );
  });
});

describe('lid span properties', () => {
  it('covers exactly the lid hours of the slice, in separate, ordered runs', () => {
    fc.assert(
      fc.property(sliceArb, ({ hourly, from, to }) => {
        const spans = lidSpans(hourly, from, to);
        const covered = new Set<number>();
        let previousEnd = -1;
        for (const span of spans) {
          // A gap of at least one clear hour separates two spans.
          expect(span.start).toBeGreaterThan(previousEnd);
          expect(span.end).toBeGreaterThan(span.start);
          previousEnd = span.end;
          for (let i = span.start; i < span.end; i++) covered.add(i);
          const heights = hourly.slice(span.start, span.end).map((h) => h.blh ?? Infinity);
          expect(span.minBlh).toBe(Math.min(...heights));
        }
        const expected = hourly
          .map((h, i) => ({ h, i }))
          .filter(({ h, i }) => i >= Math.max(0, from) && i < to && isLidHour(h))
          .map(({ i }) => i);
        expect([...covered].sort((a, b) => a - b)).toEqual(expected);
      }),
      RUNS,
    );
  });

  it('never calls an hour a lid without a shallow boundary layer reading', () => {
    fc.assert(
      fc.property(reading(2000), reading(40), (blh, wind) => {
        const lid = isLidHour({ blh, wind });
        if (blh === null || blh >= 300) expect(lid).toBe(false);
        if (lid) expect(wind ?? 0).toBeLessThan(12);
      }),
      RUNS,
    );
  });
});

describe('dispersion properties', () => {
  it('is null without both readings, and never negative with them', () => {
    const messy = fc.option(fc.double({ min: -500, max: 5000, noNaN: true }), { nil: null });
    fc.assert(
      fc.property(messy, messy, (blh, wind) => {
        const vc = ventilationCoefficient(blh, wind);
        if (blh === null || wind === null) {
          expect(vc).toBeNull();
          expect(dispersionClass(vc)).toBeNull();
        } else {
          expect(vc).toBeGreaterThanOrEqual(0);
          expect(dispersionClass(vc)).not.toBeNull();
        }
      }),
      RUNS,
    );
  });

  it('never rates dispersion worse when the air mixes higher or the wind picks up', () => {
    const order = ['stagnant', 'poor', 'moderate', 'good'];
    const level = (blh: number, wind: number) =>
      order.indexOf(dispersionClass(ventilationCoefficient(blh, wind)) ?? '');
    const value = fc.double({ min: 0, max: 3000, noNaN: true });
    fc.assert(
      fc.property(value, value, value, value, (blh, wind, moreBlh, moreWind) => {
        expect(level(blh + moreBlh, wind + moreWind)).toBeGreaterThanOrEqual(level(blh, wind));
      }),
      RUNS,
    );
  });
});

describe('hour formatting properties', () => {
  it('formats any whole hour as HH:00 on a 24 h clock and reads it back', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (hour) => {
        const label = fmtHour(hour);
        expect(label).toMatch(/^([01]\d|2[0-3]):00$/);
        expect(hourOf(`2026-11-23T${label}`)).toBe(((hour % 24) + 24) % 24);
        expect(fmtHour(hour + 24)).toBe(label);
      }),
      RUNS,
    );
  });
});
