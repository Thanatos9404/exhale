import { describe, expect, it } from 'vitest';
import { IN_TABLES, US_TABLES, aqiCategory, aqiSeries, computeAqi, hourlyAqi, subIndex, windowMean } from './aqi';
import { makeHourly } from '@/test/fixtures';

describe('subIndex', () => {
  it('matches published US EPA PM2.5 breakpoints (2024 revision)', () => {
    expect(subIndex(0, US_TABLES.pm25)).toBe(0);
    expect(subIndex(9.0, US_TABLES.pm25)).toBe(50);
    expect(subIndex(35.4, US_TABLES.pm25)).toBe(100);
    expect(subIndex(55.4, US_TABLES.pm25)).toBe(150);
    expect(subIndex(125.4, US_TABLES.pm25)).toBe(200);
    expect(subIndex(225.4, US_TABLES.pm25)).toBe(300);
  });

  it('interpolates inside a band', () => {
    // 71.5 µg/m³ sits in 55.5–125.4 → 151–200
    expect(subIndex(71.5, US_TABLES.pm25)).toBe(162);
  });

  it('snaps values in the gap between bands to the next band', () => {
    expect(subIndex(30.5, IN_TABLES.pm25)).toBe(51);
  });

  it('caps at the top of the scale and ignores bad input', () => {
    expect(subIndex(5000, US_TABLES.pm25)).toBe(500);
    expect(subIndex(-3, US_TABLES.pm25)).toBe(0);
    expect(subIndex(Number.NaN, US_TABLES.pm25)).toBe(0);
  });

  it('matches India NAQI PM2.5 category edges', () => {
    expect(subIndex(30, IN_TABLES.pm25)).toBe(50);
    expect(subIndex(60, IN_TABLES.pm25)).toBe(100);
    expect(subIndex(90, IN_TABLES.pm25)).toBe(200);
    expect(subIndex(120, IN_TABLES.pm25)).toBe(300);
    expect(subIndex(250, IN_TABLES.pm25)).toBe(400);
  });
});

describe('computeAqi', () => {
  it('reports the worst sub-index as the overall AQI and names it', () => {
    const r = computeAqi({ pm25: 20, pm10: 400, no2: 30, o3: 40 }, 'in');
    expect(r.dominant).toBe('pm10');
    expect(r.aqi).toBe(r.subIndices.pm10);
  });

  it('converts NO2 and O3 to ppb for the US scale', () => {
    // 100 ppb NO2 = 188 µg/m³ → AQI 100
    expect(computeAqi({ no2: 188 }, 'us').aqi).toBe(100);
  });

  it('skips missing pollutants', () => {
    const r = computeAqi({ pm25: null, pm10: undefined, o3: 50 }, 'in');
    expect(Object.keys(r.subIndices)).toEqual(['o3']);
  });
});

describe('aqiCategory', () => {
  it('labels each standard with its own vocabulary', () => {
    expect(aqiCategory(120, 'us').label).toBe('Unhealthy for sensitive groups');
    expect(aqiCategory(120, 'in').label).toBe('Moderate');
    expect(aqiCategory(450, 'in').label).toBe('Severe');
    expect(aqiCategory(450, 'in').level).toBe(5);
  });
});

describe('windowMean and aqiSeries', () => {
  it('averages finite values within clamped bounds', () => {
    expect(windowMean([1, null, 3], -5, 10)).toBe(2);
    expect(windowMean([null, null], 0, 1)).toBeNull();
  });

  it('produces one result per hour using trailing averages', () => {
    const hourly = makeHourly(2);
    const series = aqiSeries(hourly, 'in');
    expect(series).toHaveLength(hourly.length);
    expect(series.every((r) => r.aqi > 0)).toBe(true);
    // Trailing 24 h smooths the afternoon dip, so the instant reading is lower than the averaged one.
    const afternoon = hourly.findIndex((h, i) => i > 24 && h.time.endsWith('14:00'));
    expect(hourlyAqi(hourly[afternoon]!, 'in').aqi).toBeLessThan(series[afternoon]!.aqi);
  });
});
