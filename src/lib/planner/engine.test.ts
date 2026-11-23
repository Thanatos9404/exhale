import { describe, expect, it } from 'vitest';
import { buildPlan } from './engine';
import { DEFAULT_HOUSEHOLD, type Household } from '@/lib/profile/schema';
import { makeHourly, makeSnapshot } from '@/test/fixtures';

const clone = (h: Household): Household => structuredClone(h);
const NOW = new Date('2026-11-23T00:00:00Z');

describe('buildPlan', () => {
  const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), NOW);

  it('explains the smog lid and the cleanest window', () => {
    expect(plan.lid.stagnantHours).toBeGreaterThan(0);
    expect(plan.cleanWindow?.start).toBe('13:00');
    expect(plan.headline).toMatch(/Smog lid/);
    expect(plan.items.some((i) => i.id === 'lid')).toBe(true);
  });

  it('moves airing out of the morning inversion into the afternoon', () => {
    const v = plan.items.find((i) => i.id === 'ventilate');
    expect(v?.time).toBe('13:00');
    expect(v?.impact.doseSavedUg).toBeGreaterThan(0);
  });

  it('sends an asthmatic child indoors when no hour is clean enough', () => {
    // Cleanest hour is 70 µg/m³; the child's limit with asthma is 27.5.
    const kid = plan.items.find((i) => i.id === 'exercise-kid');
    expect(kid?.status).toBe('avoid');
    expect(kid?.title).toMatch(/indoors/);
    expect(kid?.impact.doseSavedUg).toBeGreaterThan(0);
  });

  it('moves a healthy adult outdoors only into a window within their limit', () => {
    const hh = clone(DEFAULT_HOUSEHOLD);
    const air = makeSnapshot({ hourly: makeHourly(5, '2026-11-22', (h) => (h >= 13 && h <= 15 ? 40 : 170)) });
    const p = buildPlan(hh, air, NOW);
    const you = p.items.find((i) => i.id === 'exercise-you');
    expect(you?.status).toBe('go');
    expect(you?.title).toMatch(/to 13:00/);
  });

  it('keeps a habit that is already clean', () => {
    const hh = clone(DEFAULT_HOUSEHOLD);
    const air = makeSnapshot({ hourly: makeHourly(5, '2026-11-22', () => 20, () => 1500) });
    const p = buildPlan(hh, air, NOW);
    expect(p.items.find((i) => i.id === 'exercise-you')?.title).toMatch(/^Keep/);
    expect(p.lid.stagnantHours).toBe(0);
  });

  it('swaps a solo car commute for something cleaner and counts the CO2', () => {
    const c = plan.items.find((i) => i.id === 'commute');
    expect(c).toBeDefined();
    expect(c!.impact.co2SavedKg).toBeGreaterThan(0);
    expect(plan.totals.co2SavedKgWeek).toBeCloseTo(plan.totals.co2SavedKgDay * 5, 0);
  });

  it('suggests an N95 when the current open mode is already best', () => {
    const hh = clone(DEFAULT_HOUSEHOLD);
    hh.commute = { ...hh.commute, mode: 'metro', hasN95: false, flexible: false };
    const p = buildPlan(hh, makeSnapshot(), NOW);
    const c = p.items.find((i) => i.id === 'commute');
    expect(c?.title).toMatch(/N95/);
  });

  it('skips commute advice for people working from home', () => {
    const hh = clone(DEFAULT_HOUSEHOLD);
    hh.commute = { ...hh.commute, mode: 'wfh' };
    const p = buildPlan(hh, makeSnapshot(), NOW);
    expect(p.items.some((i) => i.kind === 'commute')).toBe(false);
    expect(p.totals.co2SavedKgWeek).toBe(0);
  });

  it('flags indoor smoke sources with real savings', () => {
    const coil = plan.items.find((i) => i.id === 'coil');
    expect(coil?.status).toBe('avoid');
    expect(coil?.impact.cigarettesAvoided).toBeGreaterThan(0);
    expect(plan.items.some((i) => i.id === 'incense')).toBe(true);
  });

  it('offers paid upgrades separately from free actions', () => {
    const diy = plan.items.find((i) => i.id === 'diy-filter');
    expect(diy?.freeAction).toBe(false);
    const firstUpgrade = plan.items.findIndex((i) => !i.freeAction);
    expect(plan.items.slice(firstUpgrade).every((i) => !i.freeAction)).toBe(true);
  });

  it('recommends running an owned purifier', () => {
    const hh = clone(DEFAULT_HOUSEHOLD);
    hh.home.purifier = 'medium';
    const p = buildPlan(hh, makeSnapshot(), NOW);
    expect(p.items.find((i) => i.id === 'purifier')?.impact.doseSavedUg).toBeGreaterThan(0);
  });

  it('flags solid-fuel heating and cooking as upgrades', () => {
    const hh = clone(DEFAULT_HOUSEHOLD);
    hh.home.heating = 'coal';
    hh.home.cooking = 'biomass';
    const p = buildPlan(hh, makeSnapshot(), NOW);
    expect(p.items.find((i) => i.id === 'heating')?.freeAction).toBe(false);
    expect(p.items.find((i) => i.id === 'clean-cooking')).toBeDefined();
  });

  it('never makes the optimised day worse than the baseline', () => {
    expect(plan.totals.optimizedDoseUg).toBeLessThan(plan.totals.baselineDoseUg);
    for (const m of plan.members) {
      expect(m.optimizedDoseUg).toBeLessThanOrEqual(m.baselineDoseUg);
      expect(m.budgetUg).toBeGreaterThan(0);
      expect(m.baselineCigarettes).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same input', () => {
    const again = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), NOW);
    expect(again).toEqual(plan);
  });

  it('reports AQI in the household standard', () => {
    const hh = clone(DEFAULT_HOUSEHOLD);
    hh.standard = 'us';
    const p = buildPlan(hh, makeSnapshot(), NOW);
    expect(p.risk.standard).toBe('us');
    expect(p.risk.aqi).not.toBe(plan.risk.aqi);
  });
});

describe('buildPlan what-if selection', () => {
  const air = makeSnapshot();
  const full = buildPlan(DEFAULT_HOUSEHOLD, air, NOW);

  it('applies only the selected free actions to the totals', () => {
    const none = buildPlan(DEFAULT_HOUSEHOLD, air, NOW, { only: new Set() });
    expect(none.totals.optimizedDoseUg).toBe(none.totals.baselineDoseUg);
    expect(none.totals.co2SavedKgDay).toBe(0);
    const commuteOnly = buildPlan(DEFAULT_HOUSEHOLD, air, NOW, { only: new Set(['commute']) });
    expect(commuteOnly.totals.co2SavedKgDay).toBeGreaterThan(0);
    expect(commuteOnly.totals.optimizedDoseUg).toBeGreaterThan(full.totals.optimizedDoseUg);
  });

  it('keeps the item list identical regardless of selection', () => {
    const some = buildPlan(DEFAULT_HOUSEHOLD, air, NOW, { only: new Set(['coil']) });
    expect(some.items.map((i) => i.id)).toEqual(full.items.map((i) => i.id));
  });
});
