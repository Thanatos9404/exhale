import { describe, expect, it } from 'vitest';
import type { Place } from '@/lib/air/types';
import { buildPlan, type PlanResult } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD, type Household, type Member } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import {
  airNowText,
  airSummary,
  buildSuggestions,
  cleanHourText,
  mostSensitiveMember,
  planText,
  smogLidText,
} from './context';

const DELHI: Place = makeSnapshot().place;
/** The fixture day: AQI 325 at midnight under a 30 m lid, cleanest at 13:00. */
const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), new Date('2026-11-23T00:00:00Z'));

const adult = (id: string, patch: Partial<Member> = {}): Member => ({
  ...DEFAULT_HOUSEHOLD.members[0]!,
  id,
  name: id,
  ...patch,
});
const householdOf = (...members: Member[]): Household => ({ ...DEFAULT_HOUSEHOLD, members });

describe('mostSensitiveMember', () => {
  it('picks the first child or person with a condition', () => {
    expect(mostSensitiveMember(DEFAULT_HOUSEHOLD).id).toBe('kid');
    const seniorFirst = householdOf(
      adult('asha'),
      adult('dadi', { ageGroup: 'senior', conditions: ['heart'] }),
      adult('chintu', { ageGroup: 'child' }),
    );
    expect(mostSensitiveMember(seniorFirst).id).toBe('dadi');
  });

  it('counts a healthy child as sensitive, but not a healthy senior or teen', () => {
    const family = householdOf(
      adult('asha'),
      adult('dada', { ageGroup: 'senior' }),
      adult('riya', { ageGroup: 'teen' }),
      adult('chintu', { ageGroup: 'child' }),
    );
    expect(mostSensitiveMember(family).id).toBe('chintu');
  });

  it('falls back to the first member when nobody is sensitive', () => {
    expect(mostSensitiveMember(householdOf(adult('asha'), adult('ravi'))).id).toBe('asha');
    expect(mostSensitiveMember(householdOf(adult('solo'))).id).toBe('solo');
  });

  it('fails loudly on a household with nobody in it', () => {
    expect(() => mostSensitiveMember(householdOf())).toThrow('household member');
  });
});

describe('buildSuggestions', () => {
  it('asks about the most sensitive person by name', () => {
    const [first] = buildSuggestions(DEFAULT_HOUSEHOLD, DELHI);
    expect(first).toEqual({ q: 'When can Kid safely go outside today?', search: false });
    const solo = buildSuggestions(householdOf(adult('solo', { name: 'Meera' })), DELHI);
    expect(solo[0]!.q).toContain('Meera');
  });

  it('asks about local restrictions with live search, naming the city only', () => {
    const suggestions = buildSuggestions(DEFAULT_HOUSEHOLD, DELHI);
    const live = suggestions.filter((s) => s.search);
    expect(live).toEqual([
      { q: 'What pollution restrictions are in force in New Delhi today?', search: true },
    ]);
    const pune = buildSuggestions(DEFAULT_HOUSEHOLD, { ...DELHI, label: 'Pune' });
    expect(pune.at(-1)!.q).toContain('in Pune today');
    const long = { ...DELHI, label: 'Bengaluru, Karnataka, India' };
    expect(buildSuggestions(DEFAULT_HOUSEHOLD, long).at(-1)!.q).toContain('in Bengaluru today');
  });

  it('offers five distinct questions that fit the composer', () => {
    const suggestions = buildSuggestions(DEFAULT_HOUSEHOLD, DELHI);
    expect(suggestions).toHaveLength(5);
    expect(new Set(suggestions.map((s) => s.q)).size).toBe(5);
    for (const { q } of suggestions) {
      expect(q.endsWith('?')).toBe(true);
      expect(q.length).toBeLessThan(120);
      expect(q).not.toMatch(/undefined|null|[–—]/);
    }
  });
});

describe('air summary for the empty conversation', () => {
  it('names the place, the AQI and its category in a sentence', () => {
    expect(airSummary(plan)).toBe('New Delhi, India: AQI 325, very poor.');
  });

  it('says data is loading while there is no plan', () => {
    expect(airSummary(null)).toBe('Loading live data…');
  });
});

describe('knowledge card rows', () => {
  const withPlan = (patch: Partial<PlanResult>): PlanResult => ({ ...plan, ...patch });

  it('shows the AQI and PM2.5 right now', () => {
    expect(airNowText(plan)).toBe('AQI 325 · PM2.5 170 µg/m³');
    const rounded = withPlan({ current: { ...plan.current, pm25: 1234.6 } });
    expect(airNowText(rounded)).toContain('PM2.5 1,235 µg/m³');
  });

  // Regression test for a bug fixed on 24 Nov 2026 (src/pages/assistant/context.ts:49): a missing PM2.5 reading is printed as
  // "PM2.5 0 µg/m³", which reads as perfectly clean air. The neighbouring rows say "n/a" or
  // "None" when their figure is absent; this one should not invent a zero.
  it('does not report a missing PM2.5 reading as zero', () => {
    const noPm25 = withPlan({ current: { ...plan.current, pm25: null } });
    expect(airNowText(noPm25)).not.toMatch(/PM2\.5 0 µg/);
  });

  it('describes the first smog lid of the day', () => {
    expect(plan.lid.spans.length).toBeGreaterThan(1);
    expect(smogLidText(plan)).toBe('00:00 to 10:00 at 30 m');
  });

  it('says None when no lid is forecast', () => {
    expect(smogLidText(withPlan({ lid: { spans: [], stagnantHours: 0 } }))).toBe('None');
  });

  it('shows the cleanest hour with its PM2.5, or n/a without one', () => {
    expect(cleanHourText(plan)).toBe('13:00 · 70 µg/m³');
    expect(cleanHourText(withPlan({ cleanWindow: null }))).toBe('n/a');
  });

  it('counts the plan actions and the dose they cut, as a whole percentage', () => {
    const cut = Math.round(plan.totals.exposureCutPct);
    expect(cut).toBeGreaterThan(0);
    expect(planText(plan)).toBe(`${plan.items.length} actions · −${cut}% dose`);
    const exact = withPlan({ items: [], totals: { ...plan.totals, exposureCutPct: 12.5 } });
    expect(planText(exact)).toBe('0 actions · −13% dose');
  });
});
