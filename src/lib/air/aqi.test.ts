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
} from './aqi';
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

describe('extreme and missing values', () => {
  it('tops out at the last index of the table for absurdly high concentrations', () => {
    expect(subIndex(1e9, IN_TABLES.pm25)).toBe(500);
    expect(subIndex(Number.MAX_VALUE, US_TABLES.pm10)).toBe(500);
    // The US ozone table ends at 300; beyond it the 8 h scale has no higher band.
    expect(subIndex(5000, US_TABLES.o3)).toBe(300);
  });

  it('scores infinite or non-numeric concentrations as 0 instead of the top of the scale', () => {
    expect(subIndex(Number.POSITIVE_INFINITY, US_TABLES.pm25)).toBe(0);
    expect(subIndex(Number.NEGATIVE_INFINITY, US_TABLES.pm25)).toBe(0);
    expect(computeAqi({ pm25: Number.POSITIVE_INFINITY, pm10: Number.NaN }, 'us')).toEqual({
      aqi: 0,
      dominant: 'pm25',
      subIndices: {},
    });
  });

  it('scores an empty table as 0', () => {
    expect(subIndex(42, [])).toBe(0);
  });

  it('reports AQI 0 with PM2.5 as the nominal dominant when nothing was measured', () => {
    expect(computeAqi({}, 'in')).toEqual({ aqi: 0, dominant: 'pm25', subIndices: {} });
    expect(computeAqi({ pm25: null, pm10: null, no2: null, o3: null }, 'us').aqi).toBe(0);
  });

  it('keeps the first pollutant as dominant when two tie', () => {
    // 30 µg/m³ PM2.5 and 50 µg/m³ PM10 both score exactly 50 on the India scale.
    const r = computeAqi({ pm25: 30, pm10: 50 }, 'in');
    expect(r.subIndices).toEqual({ pm25: 50, pm10: 50 });
    expect(r.dominant).toBe('pm25');
  });

  it('truncates US particle readings before lookup, as the EPA prescribes', () => {
    // 9.09 truncates to 9.0 (AQI 50); 9.1 starts the next band (AQI 51).
    expect(computeAqi({ pm25: 9.09 }, 'us').aqi).toBe(50);
    expect(computeAqi({ pm25: 9.1 }, 'us').aqi).toBe(51);
    expect(computeAqi({ pm10: 54.9 }, 'us').aqi).toBe(50);
    expect(computeAqi({ pm10: 55 }, 'us').aqi).toBe(51);
  });

  it('categorises values outside the scale: negative as good, beyond 500 and NaN as the top', () => {
    for (const standard of ['us', 'in'] as const) {
      expect(aqiCategory(-20, standard).level).toBe(0);
      expect(aqiCategory(0, standard).level).toBe(0);
      expect(aqiCategory(9999, standard).level).toBe(5);
      expect(aqiCategory(Number.POSITIVE_INFINITY, standard).level).toBe(5);
      expect(aqiCategory(Number.NaN, standard).level).toBe(5);
    }
  });

  it('changes category exactly at each published edge of both scales', () => {
    const edges = { us: [50, 100, 150, 200, 300], in: [50, 100, 200, 300, 400] } as const;
    for (const standard of ['us', 'in'] as const) {
      edges[standard].forEach((edge, level) => {
        expect(aqiCategory(edge, standard).level).toBe(level);
        expect(aqiCategory(edge + 1, standard).level).toBe(level + 1);
      });
    }
  });

  it('returns nothing for an empty series and null for a window outside the data', () => {
    expect(aqiSeries([], 'us')).toEqual([]);
    expect(windowMean([], 0, 10)).toBeNull();
    expect(windowMean([5, 7], 3, 9)).toBeNull();
    expect(windowMean([5, 7], 1, 0)).toBeNull();
    expect(windowMean([5, Number.NaN, 7], 0, 2)).toBe(6);
  });

  it('uses only the hours that exist for the first hours of a series', () => {
    const [first] = aqiSeries(makeHourly(1), 'in');
    // With one hour of history the trailing mean is that hour, so it matches the instant AQI.
    expect(first).toEqual(hourlyAqi(makeHourly(1)[0]!, 'in'));
  });

  it('scores an hour with every pollutant missing as 0 inside an otherwise valid series', () => {
    const blank = { pm25: null, pm10: null, no2: null, o3: null };
    const hourly = makeHourly(1).map((h) => ({ ...h, ...blank }));
    expect(aqiSeries(hourly, 'us').every((r) => r.aqi === 0)).toBe(true);
    expect(hourlyAqi(blank, 'in').aqi).toBe(0);
  });
});
