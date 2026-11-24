// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../src/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '../src/lib/profile/schema';
import { makeSnapshot } from '../src/test/fixtures';

/**
 * The before-and-after story in PROBLEM_ALIGNMENT.md is the engine's output for the repository's
 * fixed winter-morning fixture. This test recomputes it and fails if the document drifts.
 */

const air = makeSnapshot();
const plan = buildPlan(DEFAULT_HOUSEHOLD, air, new Date(air.current.time));
const doc = readFileSync('PROBLEM_ALIGNMENT.md', 'utf8');
const grouped = (value: number) => value.toLocaleString('en-US');
const item = (id: string) => plan.items.find((candidate) => candidate.id === id);

describe('worked example in PROBLEM_ALIGNMENT.md', () => {
  it('quotes the household dose before and after the plan', () => {
    expect(doc).toContain(`${grouped(plan.totals.baselineDoseUg)} µg`);
    expect(doc).toContain(`${grouped(plan.totals.optimizedDoseUg)} µg`);
    expect(doc).toContain(`${Math.round(plan.totals.exposureCutPct)}% less`);
    expect(doc).toContain(`${plan.totals.cigarettesAvoided.toFixed(1)} cigarette-equivalents`);
  });

  it('quotes the weekly emissions saved', () => {
    expect(doc).toContain(`${plan.totals.co2SavedKgWeek} kg of CO2e saved per week`);
  });

  it('quotes each change exactly as the engine words it', () => {
    for (const id of ['ventilate', 'commute-time', 'coil', 'commute', 'exercise-kid']) {
      const change = item(id)?.change;
      expect(change, id).toBeDefined();
      expect(doc, `${id} before`).toContain(change?.before ?? 'missing');
      expect(doc, `${id} after`).toContain(change?.after ?? 'missing');
    }
  });

  it('quotes the largest single saving', () => {
    expect(doc).toContain(`${grouped(item('coil')?.impact.doseSavedUg ?? 0)} µg saved`);
  });

  it('quotes the headline the family sees', () => {
    expect(doc).toContain(plan.headline);
  });
});
