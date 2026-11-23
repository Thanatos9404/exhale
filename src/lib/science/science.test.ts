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
import { cleanestWindow, dirtiestWindow, dispersionClass, fmtHour, isLidHour, lidSpans, ventilationCoefficient } from './meteo';
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
    const r = simulateRoom({ outdoorPm25: 200, areaM2: 14, ventilation: 'sealed', windowsOpen: false, purifier: 'none' });
    expect(r.indoorPm25).toBeLessThan(200);
    expect(r.ratio).toBeCloseTo((0.8 * 0.3) / (0.3 + 0.2), 5);
  });

  it('lets open windows bring indoor air close to outdoor air', () => {
    const open = simulateRoom({ outdoorPm25: 200, areaM2: 14, ventilation: 'normal', windowsOpen: true, purifier: 'none' });
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
    const r = simulateRoom({ outdoorPm25: 100, areaM2: 14, ventilation: 'normal', windowsOpen: false, purifier: 'medium' });
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
    const w = cleanestWindow(hourly, 24, 48, 1, 7, 18);
    expect(w).not.toBeNull();
    expect(hourly[w!.start]!.time.slice(11, 13)).toBe('13');
    expect(w!.meanPm25).toBe(70);
  });

  it('finds the morning inversion as the dirtiest window', () => {
    const w = dirtiestWindow(hourly, 24, 48, 3);
    expect(w!.meanPm25).toBe(210);
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
