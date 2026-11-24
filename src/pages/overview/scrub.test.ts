import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aqiCategory, aqiSeries, hourlyAqi } from '@/lib/air/aqi';
import type { AirSnapshot, AqiStandard, HourPoint } from '@/lib/air/types';
import { makeHourly, makeSnapshot } from '@/test/fixtures';
import { SCRUB_HOURS, scrubHour, type AqiSeries } from './scrub';

/** The AQI series the app derives for a snapshot. */
function seriesFor(air: AirSnapshot, standard: AqiStandard): AqiSeries {
  return {
    official: aqiSeries(air.hourly, standard),
    instant: air.hourly.map((h) => hourlyAqi(h, standard)),
  };
}

function scrubAt(air: AirSnapshot, offset: number, standard: AqiStandard = 'in') {
  return scrubHour(air, seriesFor(air, standard), offset, standard);
}

/** Five days of hours with "now" at 00:00 on the second day (index 24), a Monday. */
const air = makeSnapshot();

/** A snapshot holding only the first `hours` of the fixture, with "now" at `nowIndex`. */
const shortSnapshot = (hours: number, nowIndex: number) =>
  makeSnapshot({ hourly: makeHourly().slice(0, hours), nowIndex });

describe('scrubHour on the current hour', () => {
  it('reports the hour at "now" and calls it Now', () => {
    const aqi = seriesFor(air, 'in');
    const scrub = scrubHour(air, aqi, 0, 'in')!;
    expect(scrub).toMatchObject({ isNow: true, offset: 0, index: 24, label: 'Now', pm25: 170 });
    expect(scrub.hour).toBe(air.hourly[24]);
    expect(scrub.instant).toBe(aqi.instant[24]);
    expect(scrub.official).toBe(aqi.official[24]);
  });

  it('colours the hour by its instant AQI in the chosen standard', () => {
    for (const standard of ['in', 'us'] as const) {
      const scrub = scrubAt(air, 13, standard)!;
      expect(scrub.level).toBe(aqiCategory(scrub.instant.aqi, standard).level);
    }
    // 70 µg/m³ of PM2.5 is "Moderate" in India but "Unhealthy" on the US scale.
    expect(scrubAt(air, 13, 'in')!.level).toBe(2);
    expect(scrubAt(air, 13, 'us')!.level).toBe(3);
  });

  it('classes the dispersion from mixing height and wind', () => {
    // 30 m of mixing height under a 3 km/h wind: a stagnant lid.
    expect(scrubAt(air, 0)!.dispersion).toBe('stagnant');
    // 1200 m under an 11 km/h wind in the early afternoon.
    expect(scrubAt(air, 13)!.dispersion).toBe('moderate');
  });

  it('leaves the dispersion unknown when mixing height or wind is missing', () => {
    const gap = (patch: Partial<HourPoint>) =>
      makeSnapshot({ hourly: makeHourly().map((h) => ({ ...h, ...patch })) });
    expect(scrubAt(gap({ blh: null }), 0)!.dispersion).toBeNull();
    expect(scrubAt(gap({ wind: null }), 0)!.dispersion).toBeNull();
  });
});

describe('scrubHour ahead of now', () => {
  it('moves forward by the offset and labels the hour with its weekday and time', () => {
    const aqi = seriesFor(air, 'in');
    const scrub = scrubHour(air, aqi, 13, 'in')!;
    expect(scrub).toMatchObject({ isNow: false, offset: 13, index: 37, label: 'Mon 13:00' });
    expect(scrub.hour.time).toBe('2026-11-23T13:00');
    expect(scrub.pm25).toBe(70);
    expect(scrub.instant).toBe(aqi.instant[37]);
  });

  it('keeps the official AQI on the current hour while the scrubber moves', () => {
    const aqi = seriesFor(air, 'in');
    expect(scrubHour(air, aqi, 13, 'in')!.official).toBe(aqi.official[24]);
    expect(scrubHour(air, aqi, 40, 'in')!.official).toBe(aqi.official[24]);
  });

  it('labels an hour on the next day with that day', () => {
    expect(scrubAt(air, 24)!.label).toBe('Tue 00:00');
    expect(scrubAt(air, 30)!.label).toBe('Tue 06:00');
  });

  it('reaches 48 hours when the forecast is long enough', () => {
    const scrub = scrubAt(air, SCRUB_HOURS - 1)!;
    expect(scrub.maxOffset).toBe(47);
    expect(scrub).toMatchObject({ offset: 47, index: 71 });
    expect(scrub.hour).toBe(air.hourly[71]);
  });

  it('clamps an offset past the reach of the scrubber', () => {
    expect(scrubAt(air, 48)).toMatchObject({ offset: 47, index: 71, isNow: false });
    expect(scrubAt(air, 10_000)).toMatchObject({ offset: 47, index: 71 });
    expect(scrubAt(air, Infinity)).toMatchObject({ offset: 47, index: 71 });
  });

  it('stops at the last hour when the forecast is shorter than the scrubber', () => {
    const short = shortSnapshot(30, 24);
    expect(scrubAt(short, 0)!.maxOffset).toBe(5);
    const end = scrubAt(short, 20)!;
    expect(end).toMatchObject({ offset: 5, index: 29 });
    expect(end.hour).toBe(short.hourly[29]);
  });
});

describe('scrubHour hour strip', () => {
  it('lists the next 24 hours from now, each with its own level', () => {
    const aqi = seriesFor(air, 'in');
    const { cells } = scrubHour(air, aqi, 0, 'in')!;
    expect(cells).toHaveLength(24);
    cells.forEach((cell, k) => {
      expect(cell).toMatchObject({ index: 24 + k, offset: k });
      expect(cell.hour).toBe(air.hourly[24 + k]);
      expect(cell.level).toBe(aqiCategory(aqi.instant[24 + k]!.aqi, 'in').level);
    });
    // The clean early afternoon is a lower level than the morning peak.
    expect(cells[13]!.level).toBeLessThan(cells[7]!.level);
  });

  it('does not move with the scrubber', () => {
    expect(scrubAt(air, 30)!.cells).toEqual(scrubAt(air, 0)!.cells);
  });

  it('is cut short where the forecast ends', () => {
    const { cells } = scrubAt(shortSnapshot(30, 24), 0)!;
    expect(cells.map((c) => c.index)).toEqual([24, 25, 26, 27, 28, 29]);
  });

  it('leaves out hours that have no AQI reading', () => {
    const aqi = seriesFor(air, 'in');
    const partial = { official: aqi.official, instant: aqi.instant.slice(0, 30) };
    const { cells } = scrubHour(air, partial, 0, 'in')!;
    expect(cells.map((c) => c.offset)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('scrubHour without data', () => {
  it('returns null for an empty series', () => {
    const empty = makeSnapshot({ hourly: [], nowIndex: 0 });
    expect(scrubHour(empty, { official: [], instant: [] }, 0, 'in')).toBeNull();
    expect(scrubHour(empty, { official: [], instant: [] }, 5, 'in')).toBeNull();
  });

  it('returns null when the scrubbed hour has no instant AQI', () => {
    const aqi = seriesFor(air, 'in');
    const partial = { official: aqi.official, instant: aqi.instant.slice(0, 30) };
    expect(scrubHour(air, partial, 5, 'in')).not.toBeNull();
    expect(scrubHour(air, partial, 6, 'in')).toBeNull();
  });

  it('returns null when the current hour has no official AQI', () => {
    const aqi = seriesFor(air, 'in');
    expect(scrubHour(air, { official: [], instant: aqi.instant }, 0, 'in')).toBeNull();
    expect(scrubHour(air, { official: [], instant: aqi.instant }, 12, 'in')).toBeNull();
  });

  it('returns null when "now" points past the end of the series', () => {
    expect(scrubAt(makeSnapshot({ nowIndex: 500 }), 0)).toBeNull();
  });

  it('returns null rather than a broken hour for an offset that is not a number', () => {
    expect(scrubAt(air, Number.NaN)).toBeNull();
  });

  it('handles a series that is a single hour', () => {
    const single = shortSnapshot(1, 0);
    const scrub = scrubAt(single, 0)!;
    expect(scrub).toMatchObject({ isNow: true, offset: 0, maxOffset: 0, index: 0, label: 'Now' });
    expect(scrub.cells).toHaveLength(1);
    expect(scrub.hour).toBe(single.hourly[0]);
  });

  // Regression test for a bug fixed on 24 Nov 2026 (src/pages/overview/scrub.ts:85): `isNow` is taken from the raw offset, not the clamped
  // one. When the requested offset is clamped back onto the current hour (the forecast ends at
  // "now", e.g. after switching to a place with a shorter series), the result is the current
  // hour with offset 0, yet `isNow` is false and the label reads "Sun 00:00" instead of "Now".
  it('still calls the hour Now when the offset is clamped back onto the current hour', () => {
    const scrub = scrubAt(shortSnapshot(1, 0), 3)!;
    expect(scrub).toMatchObject({ offset: 0, index: 0 });
    expect(scrub.isNow).toBe(true);
    expect(scrub.label).toBe('Now');
  });
});

describe('scrubHour invariants', () => {
  const reading = (max: number) =>
    fc.option(fc.double({ min: 0, max, noNaN: true }), { nil: null, freq: 8 });

  /** Any forecast of 1 to 100 hours with gaps in it and "now" anywhere inside. */
  const airArb: fc.Arbitrary<AirSnapshot> = fc
    .record({
      hours: fc.array(
        fc.record({
          pm25: reading(1000),
          pm10: reading(2000),
          no2: reading(1000),
          o3: reading(1000),
          wind: reading(120),
          blh: reading(4000),
        }),
        { minLength: 1, maxLength: 100 },
      ),
      nowFraction: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .map(({ hours, nowFraction }) => {
      const hourly: HourPoint[] = hours.map((values, i) => ({
        time: new Date(Date.UTC(2026, 10, 22, i)).toISOString().slice(0, 16),
        temp: 12,
        rh: 70,
        ...values,
      }));
      const nowIndex = Math.min(hourly.length - 1, Math.floor(nowFraction * hourly.length));
      return makeSnapshot({ hourly, nowIndex });
    });

  it('always lands on an hour inside the series, at or after now', () => {
    fc.assert(
      fc.property(
        airArb,
        fc.nat({ max: 500 }),
        fc.constantFrom('in', 'us'),
        (snapshot, offset, standard) => {
          const scrub = scrubAt(snapshot, offset, standard)!;
          const last = snapshot.hourly.length - 1;
          expect(scrub).not.toBeNull();
          expect(scrub.index).toBeGreaterThanOrEqual(snapshot.nowIndex);
          expect(scrub.index).toBeLessThanOrEqual(last);
          expect(scrub.hour).toBe(snapshot.hourly[scrub.index]);
          expect(scrub.index).toBe(snapshot.nowIndex + scrub.offset);
          expect(scrub.offset).toBe(Math.min(offset, scrub.maxOffset));
          expect(scrub.maxOffset).toBe(Math.min(SCRUB_HOURS - 1, last - snapshot.nowIndex));
          expect(Number.isFinite(scrub.pm25)).toBe(true);
        },
      ),
    );
  });

  it('keeps every strip cell inside the series and within a day of now', () => {
    fc.assert(
      fc.property(airArb, fc.nat({ max: 100 }), (snapshot, offset) => {
        const { cells } = scrubAt(snapshot, offset)!;
        expect(cells.length).toBe(Math.min(24, snapshot.hourly.length - snapshot.nowIndex));
        cells.forEach((cell, k) => {
          expect(cell.offset).toBe(k);
          expect(cell.index).toBe(snapshot.nowIndex + k);
          expect(cell.hour).toBe(snapshot.hourly[cell.index]);
        });
      }),
    );
  });

  it('never returns an hour from outside the series for any integer offset', () => {
    fc.assert(
      fc.property(airArb, fc.integer({ min: -500, max: 500 }), (snapshot, offset) => {
        const scrub = scrubAt(snapshot, offset);
        if (scrub === null) return;
        expect(scrub.index).toBeGreaterThanOrEqual(0);
        expect(scrub.index).toBeLessThan(snapshot.hourly.length);
        expect(scrub.hour).toBe(snapshot.hourly[scrub.index]);
      }),
    );
  });
});
