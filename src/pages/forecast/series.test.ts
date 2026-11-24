import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hourlyAqi } from '@/lib/air/aqi';
import type { AirSnapshot, HourPoint } from '@/lib/air/types';
import { isLidHour } from '@/lib/science/meteo';
import { makeHourly, makeSnapshot } from '@/test/fixtures';
import { POLLUTANTS, WHO, type ForecastRange, type SegmentColorVar } from './metrics';
import {
  axisLabel,
  buildChartView,
  cleanBand,
  cleanestHours,
  hourRows,
  lidBands,
  metricReading,
  pollutantSegments,
  upcomingHours,
  weekdayLabel,
  worstSegment,
  type PollutantSegment,
} from './series';

/** Five days of hours with "now" at 00:00 on Monday 23 November (index 24). */
const air = makeSnapshot();
const instantAqi = air.hourly.map((h) => hourlyAqi(h, 'in'));
/** One fixture day: a lid from 00:00 to 10:00 and again from 19:00. */
const day = makeHourly(1);

const LID = { blh: 50, wind: 2 };
const CLEAR = { blh: 900, wind: 14 };
/** Hours whose only difference is whether they sit under a lid. */
const hoursOf = (lids: boolean[]): HourPoint[] =>
  lids.map((lid, i) => ({ ...day[i % 24]!, ...(lid ? LID : CLEAR) }));

const viewOf = (snapshot: AirSnapshot, range: ForecastRange = '24', cleanStart?: string) =>
  buildChartView({ air: snapshot, instantAqi, metric: 'pm25', range, cleanStart });

describe('axis labels', () => {
  it('names the weekday of a wall-clock time without shifting it by a time zone', () => {
    expect(weekdayLabel('2026-11-23T06:00')).toBe('Mon');
    expect(weekdayLabel('2026-11-22T23:00')).toBe('Sun');
    expect(weekdayLabel('2026-11-24T00:00')).toBe('Tue');
  });

  it('shows the weekday at midnight and the clock time otherwise', () => {
    expect(axisLabel('2026-11-23T00:00')).toBe('Mon');
    expect(axisLabel('2026-11-23T06:00')).toBe('06:00');
    expect(axisLabel('2026-11-23T23:00')).toBe('23:00');
  });
});

describe('lidBands', () => {
  it('shades each run of lid hours up to the hour that breaks it', () => {
    expect(lidBands(day)).toEqual([
      { from: 0, to: 10, kind: 'lid' },
      { from: 19, to: 23, kind: 'lid' },
    ]);
  });

  it('finds no band on a well-mixed day or in an empty series', () => {
    expect(lidBands(hoursOf([false, false, false]))).toEqual([]);
    expect(lidBands([])).toEqual([]);
  });

  it('covers the whole chart when the lid never lifts', () => {
    expect(lidBands(hoursOf([true, true, true, true]))).toEqual([{ from: 0, to: 3, kind: 'lid' }]);
  });

  it('handles a single hour, and a lone lid hour at either end', () => {
    expect(lidBands(hoursOf([true]))).toEqual([{ from: 0, to: 0, kind: 'lid' }]);
    expect(lidBands(hoursOf([true, false, false, true]))).toEqual([
      { from: 0, to: 1, kind: 'lid' },
      { from: 3, to: 3, kind: 'lid' },
    ]);
  });

  it('does not call an hour a lid when its mixing height is unknown', () => {
    const hours = hoursOf([true, true, true]).map((h, i) => (i === 1 ? { ...h, blh: null } : h));
    expect(lidBands(hours)).toEqual([
      { from: 0, to: 1, kind: 'lid' },
      { from: 2, to: 2, kind: 'lid' },
    ]);
  });

  it('gives one ordered band per run, ending on the next clear hour or the last hour', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 80 }), (lids) => {
        const hours = hoursOf(lids);
        const last = hours.length - 1;
        const starts = lids.flatMap((lid, i) => (lid && !lids[i - 1] ? [i] : []));
        const bands = lidBands(hours);
        expect(bands.map((b) => b.from)).toEqual(starts);
        for (const band of bands) {
          const nextClear = lids.indexOf(false, band.from);
          expect(band.to).toBe(nextClear === -1 ? last : nextClear);
          expect(hours.slice(band.from, band.to).every(isLidHour)).toBe(true);
          expect(band.kind).toBe('lid');
        }
      }),
    );
  });
});

describe('cleanBand', () => {
  it('marks one hour at the first match at or after now', () => {
    expect(cleanBand(day, 0, '13:00')).toEqual({ from: 13, to: 14, kind: 'clean' });
    expect(cleanBand(day, 13, '13:00')).toEqual({ from: 13, to: 14, kind: 'clean' });
  });

  it("skips a match in the past and takes tomorrow's instead", () => {
    const twoDays = makeHourly(2);
    expect(cleanBand(twoDays, 14, '13:00')).toEqual({ from: 37, to: 38, kind: 'clean' });
  });

  it('has no band without a clean window or when the hour is out of view', () => {
    expect(cleanBand(day, 0, undefined)).toBeNull();
    expect(cleanBand(day, 14, '13:00')).toBeNull();
    expect(cleanBand(day, 0, '13:30')).toBeNull();
    expect(cleanBand([], 0, '13:00')).toBeNull();
  });
});

describe('buildChartView', () => {
  it('shows the past 12 hours and the chosen range, with now at its place', () => {
    const view = viewOf(air);
    expect(view.from).toBe(12);
    expect(view.nowLocal).toBe(12);
    expect(view.hours).toHaveLength(36);
    expect(view.hours[view.nowLocal]).toBe(air.hourly[24]);
    expect(view.hours.at(-1)!.time).toBe('2026-11-23T23:00');
    expect(viewOf(air, '48').hours).toHaveLength(60);
    expect(viewOf(air, '72').hours).toHaveLength(84);
  });

  it('plots the chosen pollutant with an axis label per hour', () => {
    const view = viewOf(air);
    expect(view.points).toHaveLength(view.hours.length);
    expect(view.points[12]).toEqual({ label: 'Mon', value: 170 });
    expect(view.points[25]).toEqual({ label: '13:00', value: 70 });
    const no2 = buildChartView({ air, instantAqi, metric: 'no2', range: '24', cleanStart: '' });
    expect(no2.points.every((p) => p.value === 40)).toBe(true);
  });

  it('plots the instant AQI of each hour for the AQI metric', () => {
    const view = buildChartView({ air, instantAqi, metric: 'aqi', range: '24', cleanStart: '' });
    expect(view.points[12]!.value).toBe(instantAqi[24]!.aqi);
    expect(view.points[25]!.value).toBe(instantAqi[37]!.aqi);
  });

  it('leaves a gap where a reading or an AQI value is missing', () => {
    const hourly = air.hourly.map((h, i) => (i === 30 ? { ...h, pm25: null } : h));
    expect(viewOf(makeSnapshot({ hourly })).points[18]!.value).toBeNull();
    const short = buildChartView({
      air,
      instantAqi: instantAqi.slice(0, 30),
      metric: 'aqi',
      range: '24',
      cleanStart: undefined,
    });
    expect(short.points[17]!.value).toBe(instantAqi[29]!.aqi);
    expect(short.points[18]!.value).toBeNull();
  });

  it('shades the lid hours in view and the clean hour ahead', () => {
    const view = viewOf(air, '24', '13:00');
    expect(view.bands).toEqual([
      { from: 7, to: 22, kind: 'lid' },
      { from: 31, to: 35, kind: 'lid' },
      { from: 25, to: 26, kind: 'clean' },
    ]);
    expect(viewOf(air).bands.some((b) => b.kind === 'clean')).toBe(false);
  });

  it('starts at the first hour when there is little history, and stops where data ends', () => {
    const early = viewOf(makeSnapshot({ nowIndex: 3 }));
    expect(early).toMatchObject({ from: 0, nowLocal: 3 });
    expect(early.hours).toHaveLength(27);
    const late = viewOf({ ...air, nowIndex: 110 }, '72');
    expect(late.hours).toHaveLength(22);
    expect(late.hours.at(-1)).toBe(air.hourly[119]);
  });

  it('copes with a single hour and with no hours at all', () => {
    const single = viewOf(makeSnapshot({ hourly: day.slice(0, 1), nowIndex: 0 }));
    expect(single).toMatchObject({ from: 0, nowLocal: 0 });
    expect(single.points).toEqual([{ label: 'Sun', value: 170 }]);
    const empty = viewOf(makeSnapshot({ hourly: [], nowIndex: 0 }));
    expect(empty).toMatchObject({ hours: [], points: [], bands: [] });
  });

  it('always keeps now, the points and the bands inside the window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 119 }),
        fc.constantFrom<ForecastRange>('24', '48', '72'),
        (nowIndex, range) => {
          const view = viewOf({ ...air, nowIndex }, range, '13:00');
          expect(view.hours[view.nowLocal]).toBe(air.hourly[nowIndex]);
          expect(view.hours[0]).toBe(air.hourly[view.from]);
          expect(view.points).toHaveLength(view.hours.length);
          expect(view.hours.length).toBeLessThanOrEqual(12 + Number(range));
          for (const band of view.bands) {
            expect(band.from).toBeGreaterThanOrEqual(0);
            expect(band.from).toBeLessThanOrEqual(band.to);
            expect(band.to).toBeLessThanOrEqual(view.hours.length);
          }
        },
      ),
    );
  });
});

describe('hourRows', () => {
  it('formats one row per hour for the data table', () => {
    const rows = hourRows(viewOf(air));
    expect(rows).toHaveLength(36);
    expect(rows[12]).toEqual({
      key: '2026-11-23T00:00',
      time: '2026-11-23 00:00',
      value: '170',
      blh: '30 m',
      wind: '3.0 km/h',
    });
    expect(rows[25]).toMatchObject({ value: '70', blh: '1,200 m', wind: '11.0 km/h' });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('writes n/a for a missing value, mixing height or wind', () => {
    const hourly = air.hourly.map((h) => ({ ...h, pm25: null, blh: null, wind: null }));
    const rows = hourRows(viewOf(makeSnapshot({ hourly })));
    expect(rows[0]).toMatchObject({ value: 'n/a', blh: 'n/a', wind: 'n/a' });
    expect(JSON.stringify(rows)).not.toMatch(/NaN|null|undefined/);
  });
});

describe('metricReading', () => {
  /** The fixture with PM2.5 set at now and at the same hour yesterday. */
  const withPm25 = (yesterday: number | null, now: number | null) =>
    makeSnapshot({
      hourly: air.hourly.map((h, i) => {
        if (i === 0) return { ...h, pm25: yesterday };
        return i === 24 ? { ...h, pm25: now } : h;
      }),
    });

  it('reads the value now and its change against 24 hours ago', () => {
    expect(metricReading('pm25', withPm25(100, 150), instantAqi)).toEqual({ cur: 150, delta: 50 });
    expect(metricReading('pm25', withPm25(200, 50), instantAqi)).toEqual({ cur: 50, delta: -75 });
    expect(metricReading('pm25', air, instantAqi)).toEqual({ cur: 170, delta: 0 });
  });

  it('reads the instant AQI for the AQI metric', () => {
    const aqi = instantAqi.map((r, i) => (i === 0 ? { ...r, aqi: 200 } : r));
    const reading = metricReading('aqi', air, aqi);
    expect(reading.cur).toBe(instantAqi[24]!.aqi);
    expect(reading.delta).toBeCloseTo(((reading.cur - 200) / 200) * 100, 9);
  });

  it('reports no change, never Infinity or NaN, when yesterday was zero or missing', () => {
    expect(metricReading('pm25', withPm25(0, 150), instantAqi)).toEqual({ cur: 150, delta: 0 });
    expect(metricReading('pm25', withPm25(null, 150), instantAqi)).toEqual({ cur: 150, delta: 0 });
    expect(metricReading('aqi', air, [])).toEqual({ cur: 0, delta: 0 });
  });

  it('reports no change for an empty series or one with no history', () => {
    expect(metricReading('o3', makeSnapshot({ hourly: [], nowIndex: 0 }), [])).toEqual({
      cur: 0,
      delta: 0,
    });
    expect(metricReading('pm25', makeSnapshot({ nowIndex: 0 }), instantAqi)).toEqual({
      cur: 170,
      delta: 0,
    });
  });
});

describe('pollutant mix', () => {
  const colors: Record<SegmentColorVar, string> = {
    blue: '#00f',
    amber: '#fa0',
    'aqi-4': '#f00',
    green: '#0f0',
  };
  const now: HourPoint = { ...day[0]!, pm25: 150, pm10: 90, no2: 25, o3: 50 };

  it('sizes each pollutant by its multiple of the WHO guideline', () => {
    expect(pollutantSegments(now, colors)).toEqual([
      { key: 'pm25', ratio: 10, color: '#00f' },
      { key: 'pm10', ratio: 2, color: '#fa0' },
      { key: 'no2', ratio: 1, color: '#f00' },
      { key: 'o3', ratio: 0.5, color: '#0f0' },
    ]);
  });

  it('gives a missing pollutant an empty arc', () => {
    const segments = pollutantSegments({ ...now, pm25: null, o3: null }, colors);
    expect(segments.map((s) => s.ratio)).toEqual([0, 2, 1, 0]);
    expect(segments.map((s) => s.key)).toEqual(POLLUTANTS);
  });

  it('picks the pollutant furthest over its guideline, the first one on a tie', () => {
    expect(worstSegment(pollutantSegments(now, colors)).key).toBe('pm25');
    expect(worstSegment(pollutantSegments({ ...now, pm25: 3, o3: 900 }, colors)).key).toBe('o3');
    const tied = pollutantSegments({ ...now, pm25: 30, pm10: 90, no2: 50, o3: 200 }, colors);
    expect(worstSegment(tied).key).toBe('pm25');
    const allMissing = pollutantSegments(
      { ...now, pm25: null, pm10: null, no2: null, o3: null },
      colors,
    );
    expect(worstSegment(allMissing)).toMatchObject({ key: 'pm25', ratio: 0 });
  });

  it('never ranks a segment above the worst one', () => {
    const level = fc.option(fc.double({ min: 0, max: 2000, noNaN: true }), { nil: null });
    fc.assert(
      fc.property(level, level, level, level, (pm25, pm10, no2, o3) => {
        const segments = pollutantSegments({ ...now, pm25, pm10, no2, o3 }, colors);
        const worst: PollutantSegment = worstSegment(segments);
        expect(segments).toContain(worst);
        for (const s of segments) {
          expect(s.ratio).toBeLessThanOrEqual(worst.ratio);
          expect(s.ratio).toBeCloseTo(({ pm25, pm10, no2, o3 }[s.key] ?? 0) / WHO[s.key], 9);
        }
      }),
    );
  });
});

describe('upcomingHours', () => {
  it('takes the current hour and the ones after it', () => {
    const next = upcomingHours(air, 24);
    expect(next).toHaveLength(24);
    expect(next[0]).toBe(air.hourly[24]);
    expect(next[23]).toBe(air.hourly[47]);
  });

  it('returns what is left near the end of the series, and nothing for a count of zero', () => {
    expect(upcomingHours(makeSnapshot({ nowIndex: 118 }), 24)).toEqual(air.hourly.slice(118));
    expect(upcomingHours(air, 0)).toEqual([]);
    expect(upcomingHours(makeSnapshot({ hourly: [], nowIndex: 0 }), 24)).toEqual([]);
  });
});

describe('cleanestHours', () => {
  it('lists the hours with the lowest PM2.5, cleanest first', () => {
    const top = cleanestHours(day, 3);
    expect(top.map((h) => h.time.slice(11, 16))).toEqual(['13:00', '14:00', '15:00']);
    expect(top.every((h) => h.pm25 === 70)).toBe(true);
    expect(cleanestHours(day, 5).map((h) => h.pm25)).toEqual([70, 70, 70, 100, 100]);
  });

  it('skips hours without a reading and leaves the input in order', () => {
    const hours = day.map((h, i) => (i === 13 ? { ...h, pm25: null } : h));
    const before = hours.map((h) => h.time);
    expect(cleanestHours(hours, 2).map((h) => h.time.slice(11, 16))).toEqual(['14:00', '15:00']);
    expect(hours.map((h) => h.time)).toEqual(before);
  });

  it('returns fewer hours when there are not enough readings', () => {
    expect(cleanestHours(day.slice(0, 2), 5)).toHaveLength(2);
    expect(cleanestHours(day, 0)).toEqual([]);
    expect(cleanestHours([], 3)).toEqual([]);
    expect(
      cleanestHours(
        day.map((h) => ({ ...h, pm25: null })),
        3,
      ),
    ).toEqual([]);
  });

  it('returns the smallest readings in ascending order', () => {
    const reading = fc.option(fc.double({ min: 0, max: 1000, noNaN: true }), { nil: null });
    fc.assert(
      fc.property(fc.array(reading, { maxLength: 48 }), fc.nat({ max: 12 }), (values, count) => {
        const hours = values.map((pm25, i) => ({ ...day[i % 24]!, pm25 }));
        const measured = values.filter((v) => v != null).sort((a, b) => a - b);
        const picked = cleanestHours(hours, count);
        expect(picked.map((h) => h.pm25)).toEqual(measured.slice(0, count));
        for (const hour of picked) expect(hours).toContain(hour);
      }),
    );
  });
});
