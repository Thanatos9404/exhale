import { describe, expect, it } from 'vitest';
import {
  METRICS,
  METRIC_INFO,
  POLLUTANTS,
  SEGMENT_COLOR,
  SEGMENT_COLOR_VARS,
  THRESHOLDS,
  WHO,
  type Metric,
} from './metrics';

const METRIC_KEYS: Metric[] = ['aqi', 'pm25', 'pm10', 'no2', 'o3'];

describe('forecast metrics', () => {
  it('offers a tab for every metric, AQI first, each under its own key', () => {
    expect(METRICS.map((m) => m.key)).toEqual(METRIC_KEYS);
    for (const key of METRIC_KEYS) {
      expect(METRIC_INFO[key].key).toBe(key);
      expect(METRIC_INFO[key].label.length).toBeGreaterThan(0);
    }
    expect(new Set(METRICS.map((m) => m.label)).size).toBe(METRICS.length);
  });

  it('gives concentrations a unit and leaves the AQI index without one', () => {
    expect(METRIC_INFO.aqi.unit).toBe('');
    for (const p of POLLUTANTS) expect(METRIC_INFO[p].unit).toBe('µg/m³');
  });

  it('covers every pollutant once in the mix, with a guideline and a colour of its own', () => {
    expect([...POLLUTANTS].sort()).toEqual(METRIC_KEYS.filter((k) => k !== 'aqi').sort());
    for (const p of POLLUTANTS) {
      expect(WHO[p]).toBeGreaterThan(0);
      expect(SEGMENT_COLOR_VARS).toContain(SEGMENT_COLOR[p]);
    }
    expect(new Set(POLLUTANTS.map((p) => SEGMENT_COLOR[p])).size).toBe(POLLUTANTS.length);
  });

  it('uses the WHO 2021 guideline levels', () => {
    expect(WHO).toEqual({ pm25: 15, pm10: 45, no2: 25, o3: 100 });
  });
});

describe('chart thresholds', () => {
  it('draws labelled lines in ascending order for every metric and standard', () => {
    for (const key of METRIC_KEYS) {
      for (const standard of ['in', 'us'] as const) {
        const lines = THRESHOLDS[key](standard);
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.map((t) => t.value)).toEqual(lines.map((t) => t.value).sort((a, b) => a - b));
        for (const line of lines) {
          expect(line.value).toBeGreaterThan(0);
          expect(line.label.trim()).toBe(line.label);
          expect(line.label.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('marks the WHO guideline as the first line of every pollutant chart', () => {
    for (const p of POLLUTANTS) {
      const [first] = THRESHOLDS[p]('in');
      expect(first!.value).toBe(WHO[p]);
      expect(first!.label).toMatch(/^WHO/);
      expect(THRESHOLDS[p]('us')).toEqual(THRESHOLDS[p]('in'));
    }
  });

  it('names the AQI lines after the bands of the chosen standard', () => {
    expect(THRESHOLDS.aqi('in')).toEqual([
      { value: 100, label: 'Satisfactory limit' },
      { value: 200, label: 'Moderate limit' },
    ]);
    expect(THRESHOLDS.aqi('us')).toEqual([
      { value: 100, label: 'Moderate limit' },
      { value: 150, label: 'Sensitive groups' },
    ]);
  });

  it('hands out a fresh list each time, so a chart cannot alter the next one', () => {
    const first = THRESHOLDS.pm25('in');
    first.push({ value: 999, label: 'stray' });
    expect(THRESHOLDS.pm25('in')).toHaveLength(2);
  });
});
