import { describe, expect, it } from 'vitest';
import {
  BREATHING_RATE,
  CIGARETTE_PM25_24H,
  cigarettesFromConcHours,
  cigarettesPerDay,
  inhaledDose,
  outdoorEffortLimit,
  sensitivityOf,
} from './exposure';
import { PURIFIER_CADR, infiltrationRatio, simulateRoom, sourceIncrement } from './indoor';
import { MODES, N95_FACTOR, rankModes, tripExposure } from './commute';
import {
  cleanestWindow,
  dirtiestWindow,
  dispersionClass,
  fmtHour,
  isLidHour,
  lidSpans,
  ventilationCoefficient,
} from './meteo';
import { makeHourly } from '@/test/fixtures';

describe('exposure', () => {
  it('computes dose as concentration × breathing rate × time', () => {
    expect(inhaledDose(100, 0.5, 2)).toBe(100);
    expect(inhaledDose(-1, 0.5, 2)).toBe(0);
  });

  it('breathes harder with effort, for every age group', () => {
    for (const rates of Object.values(BREATHING_RATE)) {
      expect(rates.vigorous).toBeGreaterThan(rates.moderate);
      expect(rates.moderate).toBeGreaterThan(rates.light);
      expect(rates.light).toBeGreaterThan(rates.rest);
    }
  });

  it('uses the Berkeley Earth 22 µg/m³ per cigarette equivalence', () => {
    expect(cigarettesPerDay(CIGARETTE_PM25_24H)).toBeCloseTo(1);
    expect(cigarettesPerDay(220)).toBeCloseTo(10);
    expect(cigarettesFromConcHours(-10)).toBe(0);
  });

  it('takes the most sensitive trait and lowers the outdoor limit for it', () => {
    expect(sensitivityOf('adult', [])).toBe(1);
    expect(sensitivityOf('child', ['asthma'])).toBe(2);
    expect(outdoorEffortLimit(1)).toBe(55);
    expect(outdoorEffortLimit(2)).toBe(27.5);
    // Never stricter than the WHO guideline.
    expect(outdoorEffortLimit(10)).toBe(15);
  });
});

describe('indoor mass balance', () => {
  it('keeps a sealed home below outdoor levels without sources', () => {
    const r = simulateRoom({
      outdoorPm25: 200,
      areaM2: 14,
      ventilation: 'sealed',
      windowsOpen: false,
      purifier: 'none',
    });
    expect(r.indoorPm25).toBeLessThan(200);
    expect(r.ratio).toBeCloseTo((0.8 * 0.3) / (0.3 + 0.2), 5);
  });

  it('lets open windows bring indoor air close to outdoor air', () => {
    const open = simulateRoom({
      outdoorPm25: 200,
      areaM2: 14,
      ventilation: 'normal',
      windowsOpen: true,
      purifier: 'none',
    });
    expect(open.ratio).toBeGreaterThan(0.9);
  });

  it('cuts indoor PM2.5 with a purifier, more with a bigger one', () => {
    const none = infiltrationRatio('normal', 'none', 14);
    const small = infiltrationRatio('normal', 'small', 14);
    const large = infiltrationRatio('normal', 'large', 14);
    expect(small).toBeLessThan(none);
    expect(large).toBeLessThan(small);
    expect(PURIFIER_CADR.diy).toBeGreaterThan(PURIFIER_CADR.large);
  });

  it('adds indoor sources on top, diluted by a bigger room', () => {
    const small = sourceIncrement(12_000, 'normal', 'none', 10);
    const big = sourceIncrement(12_000, 'normal', 'none', 40);
    expect(small).toBeGreaterThan(big);
    expect(sourceIncrement(0, 'normal', 'none', 10)).toBe(0);
  });

  it('reports how fast the room settles', () => {
    const r = simulateRoom({
      outdoorPm25: 100,
      areaM2: 14,
      ventilation: 'normal',
      windowsOpen: false,
      purifier: 'medium',
    });
    expect(r.timeConstantMin).toBeGreaterThan(0);
    expect(r.timeConstantMin).toBeLessThan(60);
  });
});

describe('commute', () => {
  const base = { distanceKm: 10, ambientPm25: 200, ageGroup: 'adult' as const, n95: false };

  it('scales emissions with distance and mode', () => {
    expect(tripExposure({ ...base, mode: 'car' }).co2Kg).toBeCloseTo(1.7);
    expect(tripExposure({ ...base, mode: 'cycle' }).co2Kg).toBe(0);
  });

  it('applies the N95 only to modes open to street air', () => {
    const bus = tripExposure({ ...base, mode: 'bus' });
    const busMask = tripExposure({ ...base, mode: 'bus', n95: true });
    expect(busMask.doseUg).toBeCloseTo(bus.doseUg * N95_FACTOR);
    const car = tripExposure({ ...base, mode: 'car', n95: true });
    expect(car.breathedPm25).toBeCloseTo(200 * MODES.car.exposureFactor);
  });

  it('ranks a lower-dose, lower-carbon option above a solo car', () => {
    const ranked = rankModes({ ...base, mode: 'car' });
    expect(ranked[0]!.mode).not.toBe('car');
    expect(ranked[0]!.co2Kg).toBeLessThan(tripExposure({ ...base, mode: 'car' }).co2Kg);
  });

  it('never suggests walking 20 km', () => {
    const ranked = rankModes({ ...base, distanceKm: 20, mode: 'car' });
    expect(ranked.map((r) => r.mode)).not.toContain('walk');
  });
});

describe('meteorology', () => {
  const hourly = makeHourly(2);

  it('computes the ventilation coefficient in m²/s', () => {
    expect(ventilationCoefficient(1000, 36)).toBe(10_000);
    expect(ventilationCoefficient(null, 10)).toBeNull();
    expect(dispersionClass(500)).toBe('stagnant');
    expect(dispersionClass(10_000)).toBe('good');
    expect(dispersionClass(null)).toBeNull();
  });

  it('flags shallow, calm hours as lid hours', () => {
    expect(isLidHour({ blh: 30, wind: 3 })).toBe(true);
    expect(isLidHour({ blh: 1200, wind: 3 })).toBe(false);
    expect(isLidHour({ blh: null, wind: 3 })).toBe(false);
  });

  it('finds the afternoon as the cleanest daylight hour', () => {
    const w = cleanestWindow(hourly, 24, 48, { duration: 1, dayStart: 7, dayEnd: 18 });
    expect(w).not.toBeNull();
    expect(hourly[w!.start]!.time.slice(11, 13)).toBe('13');
    expect(w!.meanPm25).toBe(70);
  });

  it('finds the morning inversion as the dirtiest window', () => {
    const w = dirtiestWindow(hourly, 24, 48, 3);
    expect(w!.meanPm25).toBe(210);
  });

  it('skips gaps for the cleanest run but averages around them for the dirtiest', () => {
    const gappy = hourly.map((h, i) => (i === 37 ? { ...h, pm25: null } : h));
    expect(cleanestWindow(gappy, 24, 48, { duration: 1, dayStart: 7, dayEnd: 18 })?.start).not.toBe(
      37,
    );
    expect(dirtiestWindow(gappy, 36, 39, 3)?.meanPm25).toBe(85);
  });

  it('never reads past either end of the series', () => {
    expect(cleanestWindow(hourly, 40, 999, { duration: 3 })?.end).toBeLessThanOrEqual(
      hourly.length,
    );
    expect(dirtiestWindow(hourly, 47, 48, 3)).toBeNull();
    expect(lidSpans(hourly, 40, 999).at(-1)?.end).toBe(hourly.length);
    expect(lidSpans(hourly, 30, 10)).toEqual([]);
  });

  it('groups lid hours into spans', () => {
    const spans = lidSpans(hourly, 24, 48);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0]!.minBlh).toBe(30);
  });

  it('formats hours on a 24 h clock with wrap-around', () => {
    expect(fmtHour(7)).toBe('07:00');
    expect(fmtHour(25)).toBe('01:00');
    expect(fmtHour(-1)).toBe('23:00');
  });
});

describe('edge cases', () => {
  const hourly = makeHourly(2);

  it('finds no window and no lid in an empty series', () => {
    expect(cleanestWindow([], 0, 24)).toBeNull();
    expect(dirtiestWindow([], 0, 24, 3)).toBeNull();
    expect(lidSpans([], 0, 24)).toEqual([]);
  });

  it('finds no window when the run is longer than the slice', () => {
    expect(cleanestWindow(hourly, 10, 12, { duration: 3 })).toBeNull();
    expect(dirtiestWindow(hourly, 10, 12, 3)).toBeNull();
    expect(cleanestWindow(hourly, 12, 10)).toBeNull();
  });

  it('finds no cleanest window when no hour of day is allowed or every reading is missing', () => {
    expect(cleanestWindow(hourly, 0, 48, { dayStart: 18, dayEnd: 7 })).toBeNull();
    const blank = hourly.map((h) => ({ ...h, pm25: null }));
    expect(cleanestWindow(blank, 0, 48)).toBeNull();
    expect(dirtiestWindow(blank, 0, 48, 3)).toBeNull();
  });

  it('prefers the earliest of two equally clean windows', () => {
    // 13:00 to 15:00 are all 70 µg/m³ on both days.
    expect(cleanestWindow(hourly, 0, 48)?.start).toBe(13);
    expect(dirtiestWindow(hourly, 0, 48)?.start).toBe(6);
  });

  it('sees no lid without boundary-layer data, and treats missing wind as calm', () => {
    const noBlh = hourly.map((h) => ({ ...h, blh: null }));
    expect(lidSpans(noBlh, 0, 48)).toEqual([]);
    expect(isLidHour({ blh: 100, wind: null })).toBe(true);
    expect(isLidHour({ blh: 100, wind: 12 })).toBe(false);
    expect(isLidHour({ blh: 300, wind: 0 })).toBe(false);
  });

  it('clamps a negative boundary layer or wind to zero ventilation', () => {
    expect(ventilationCoefficient(-50, 10)).toBe(0);
    expect(ventilationCoefficient(500, -3)).toBe(0);
    expect(ventilationCoefficient(1000, 3.6)).toBe(1000);
    expect(dispersionClass(0)).toBe('stagnant');
    expect(dispersionClass(1000)).toBe('poor');
    expect(dispersionClass(3000)).toBe('moderate');
    expect(dispersionClass(6000)).toBe('good');
  });

  it('costs no time, dose or CO2 for a zero-distance commute in any mode', () => {
    for (const mode of [
      'walk',
      'cycle',
      'metro',
      'bus',
      'auto',
      'twoWheeler',
      'car',
      'ev',
    ] as const) {
      expect(
        tripExposure({ mode, distanceKm: 0, ambientPm25: 300, ageGroup: 'adult', n95: false }),
      ).toMatchObject({ minutes: 0, doseUg: 0, co2Kg: 0, cigarettes: 0 });
    }
  });

  it('ranks every mode equally, without dividing by zero, for a zero-distance commute', () => {
    const options = rankModes({
      mode: 'car',
      distanceKm: 0,
      ambientPm25: 200,
      ageGroup: 'adult',
      n95: false,
    });
    expect(options).toHaveLength(Object.keys(MODES).length);
    expect(options.every((o) => o.score === options[0]!.score)).toBe(true);
    expect(options.every((o) => Number.isFinite(o.score))).toBe(true);
  });

  it('ranks by CO2 and time alone when the air is perfectly clean', () => {
    const [best] = rankModes({
      mode: 'car',
      distanceKm: 8,
      ambientPm25: 0,
      ageGroup: 'adult',
      n95: false,
    });
    expect(best!.doseUg).toBe(0);
    expect(best!.co2Kg).toBeLessThan(0.17 * 8);
  });

  it('drops the current mode from the ranking once the trip is beyond its range', () => {
    const options = rankModes({
      mode: 'walk',
      distanceKm: 3.5,
      ambientPm25: 150,
      ageGroup: 'adult',
      n95: false,
    });
    expect(options.map((o) => o.mode)).not.toContain('walk');
    expect(options.length).toBeGreaterThan(0);
  });

  it('gives a mask no effect inside a closed car', () => {
    const base = { mode: 'car', distanceKm: 10, ambientPm25: 200, ageGroup: 'adult' } as const;
    expect(tripExposure({ ...base, n95: true })).toEqual(tripExposure({ ...base, n95: false }));
    expect(N95_FACTOR).toBeLessThan(1);
  });

  it('reports a clean, source-free room as 0 with a ratio of 0, not NaN', () => {
    const room = simulateRoom({
      outdoorPm25: 0,
      areaM2: 45,
      ventilation: 'normal',
      windowsOpen: false,
      purifier: 'none',
    });
    expect(room.indoorPm25).toBe(0);
    expect(room.ratio).toBe(0);
  });

  it('models any room smaller than 5 m² as 5 m²', () => {
    const tiny = { outdoorPm25: 100, ventilation: 'sealed', windowsOpen: false } as const;
    expect(simulateRoom({ ...tiny, areaM2: 0, purifier: 'large' })).toEqual(
      simulateRoom({ ...tiny, areaM2: 5, purifier: 'large' }),
    );
    expect(simulateRoom({ ...tiny, areaM2: -10, purifier: 'none' }).volumeM3).toBe(14);
    expect(PURIFIER_CADR.none).toBe(0);
    expect(sourceIncrement(0, 'sealed', 'none', 45)).toBe(0);
    expect(infiltrationRatio('leaky', 'none', 45)).toBeLessThan(1);
  });

  it('gives the most sensitive person the WHO guideline as their outdoor limit, never less', () => {
    expect(outdoorEffortLimit(100)).toBe(15);
    expect(outdoorEffortLimit(0)).toBe(55);
    expect(outdoorEffortLimit(-3)).toBe(55);
    expect(sensitivityOf('adult', [])).toBe(1);
    expect(sensitivityOf('child', ['asthma', 'heart', 'copd', 'pregnancy'])).toBe(2);
    expect(inhaledDose(100, 0.5, 0)).toBe(0);
    expect(cigarettesFromConcHours(-5)).toBe(0);
    expect(cigarettesPerDay(CIGARETTE_PM25_24H)).toBe(1);
    expect(BREATHING_RATE.adult.rest).toBeGreaterThan(0);
  });
});
