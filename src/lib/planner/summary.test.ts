import { describe, expect, it } from 'vitest';
import { makeHourly } from '@/test/fixtures';
import { hourSpan, round } from './format';
import { noImpact } from './impact';
import { currentConditions, headlineFor, lidSummary, riskNow, windowSummary } from './summary';
import { selectedCo2PerDay, selectionFrom, sortItems } from './totals';
import type { PlanResult, RoutineItem } from './types';

const hourly = makeHourly();

function item(id: string, overrides: Partial<RoutineItem> = {}): RoutineItem {
  return {
    id,
    kind: 'home',
    status: 'go',
    time: null,
    endTime: null,
    title: id,
    detail: '',
    memberIds: [],
    impact: noImpact(),
    freeAction: true,
    ...overrides,
  };
}

describe('format', () => {
  it('rounds to the requested decimal places', () => {
    expect(round(12.345, 2)).toBe(12.35);
    expect(round(12.5)).toBe(13);
  });

  it('labels a span by the hour its last slot closes, wrapping at midnight', () => {
    expect(hourSpan(hourly, 13, 14)).toEqual({ start: '13:00', end: '14:00' });
    expect(hourSpan(hourly, 23, 23)).toEqual({ start: '23:00', end: '00:00' });
  });
});

describe('summary', () => {
  const risk: PlanResult['risk'] = {
    aqi: 180,
    level: 3,
    label: 'Unhealthy',
    advice: '',
    dominant: 'pm25',
    standard: 'us',
  };

  it('leads with the first smog lid when there is one', () => {
    const lid = lidSummary(hourly, [
      { start: 26, end: 28, minBlh: 31.6 },
      { start: 40, end: 45, minBlh: 20 },
    ]);
    expect(lid.stagnantHours).toBe(7);
    const clean = windowSummary(hourly, { start: 37, end: 38, meanPm25: 69.6 });
    expect(headlineFor(lid, clean, risk, 23.6)).toBe(
      "Smog lid 02:00 to 04:00: air can only mix 32 m high. Cleanest hour is 13:00. Today's plan cuts your household's dose by 24%.",
    );
  });

  it('falls back to the AQI when the air is mixing', () => {
    const noLid = lidSummary(hourly, []);
    expect(headlineFor(noLid, null, risk, 0)).toBe(
      "Air is unhealthy (AQI 180). Today's plan cuts your household's dose by 0%.",
    );
  });

  it('reports nothing for missing data rather than inventing readings', () => {
    expect(windowSummary(hourly, null)).toBeNull();
    expect(currentConditions(undefined)).toEqual({
      pm25: null,
      blh: null,
      wind: null,
      ventilationCoefficient: null,
      dispersion: null,
    });
    expect(riskNow([], 0, 'in')).toMatchObject({ aqi: 0, dominant: 'pm25', standard: 'in' });
  });
});

describe('totals', () => {
  it('sorts free actions first, then by dose saved, then avoid before go before caution', () => {
    const saved = (doseSavedUg: number) => ({ ...noImpact(), doseSavedUg });
    const items = [
      item('upgrade', { freeAction: false, impact: saved(900) }),
      item('caution', { status: 'caution', impact: saved(50) }),
      item('go', { impact: saved(50) }),
      item('avoid', { status: 'avoid', impact: saved(50) }),
      item('big', { impact: saved(400) }),
    ];
    expect(sortItems(items).map((i) => i.id)).toEqual(['big', 'avoid', 'go', 'caution', 'upgrade']);
  });

  it('counts CO2 only from selected free actions', () => {
    const co2 = (co2SavedKg: number) => ({ ...noImpact(), co2SavedKg });
    const items = [
      item('commute', { impact: co2(2.5) }),
      item('upgrade', { freeAction: false, impact: co2(9) }),
    ];
    expect(selectedCo2PerDay(items, selectionFrom(undefined))).toBe(2.5);
    expect(selectedCo2PerDay(items, selectionFrom(new Set(['upgrade'])))).toBe(0);
  });
});
