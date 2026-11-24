/** Aggregation: per-member summaries, household totals and the order items are shown in. */
import { defined } from '../assert.js';
import {
  cigarettesFromConcHours,
  outdoorEffortLimit,
  sensitivityOf,
  WHO_PM25_24H,
} from '../science/exposure.js';
import type { Household, Member } from '../profile/schema.js';
import { round } from './format.js';
import type { HouseholdExposure } from './simulator.js';
import type { Impact, MemberSummary, PlanResult, RoutineItem, RoutineStatus } from './types.js';

/** Among equally useful items, the ones to stop come before the ones to keep or adjust. */
const STATUS_ORDER: Record<RoutineStatus, number> = { avoid: 0, go: 1, caution: 2 };

/** True for items the user has chosen in a what-if, or every item when nothing is chosen. */
export function selectionFrom(only: ReadonlySet<string> | undefined): (id: string) => boolean {
  return (id) => !only || only.has(id);
}

/** Each member's baseline and optimised day, with their WHO-guideline budget for comparison. */
export function memberSummaries(
  members: readonly Member[],
  base: HouseholdExposure,
  optimized: HouseholdExposure,
): MemberSummary[] {
  return members.map((m) => {
    // Both maps are built from this same member list.
    const b = defined(base.get(m.id), `baseline exposure of ${m.id}`);
    const o = defined(optimized.get(m.id), `optimised exposure of ${m.id}`);
    const sensitivity = sensitivityOf(m.ageGroup, m.conditions);
    return {
      id: m.id,
      name: m.name,
      sensitivity,
      pm25Limit: outdoorEffortLimit(sensitivity),
      budgetUg: round(WHO_PM25_24H * b.breathedM3),
      baselineDoseUg: round(b.doseUg),
      optimizedDoseUg: round(o.doseUg),
      baselineCigarettes: round(cigarettesFromConcHours(b.concHours), 2),
      optimizedCigarettes: round(cigarettesFromConcHours(o.concHours), 2),
    };
  });
}

/** kg CO2e saved per day by the selected free actions. Upgrades are not counted. */
export function selectedCo2PerDay(
  items: readonly RoutineItem[],
  isSelected: (id: string) => boolean,
): number {
  return items
    .filter((i) => i.freeAction && isSelected(i.id))
    .reduce((sum, i) => sum + i.impact.co2SavedKg, 0);
}

/** Inhaled PM2.5 summed over every member, µg, unrounded. */
export function totalDose(exposure: HouseholdExposure): number {
  return [...exposure.values()].reduce((sum, e) => sum + e.doseUg, 0);
}

/** What `planTotals` adds up. */
export interface PlanTotalsInput {
  /** The household's day with today's habits. */
  base: HouseholdExposure;
  /** The household's day with the selected free actions applied. */
  optimized: HouseholdExposure;
  /** What the optimised day saves the whole household. */
  impact: Impact;
  /** kg CO2e saved per day by the selected free actions. */
  co2PerDay: number;
  commute: Household['commute'];
}

/** Household totals. Weekly CO2 counts only commuting days; working from home saves none. */
export function planTotals(input: PlanTotalsInput): PlanResult['totals'] {
  const { base, optimized, impact, co2PerDay, commute } = input;
  const workDays = commute.mode === 'wfh' ? 0 : commute.daysPerWeek;
  return {
    baselineDoseUg: round(totalDose(base)),
    optimizedDoseUg: round(totalDose(optimized)),
    exposureCutPct: impact.exposureCutPct,
    cigarettesAvoided: impact.cigarettesAvoided,
    co2SavedKgDay: round(co2PerDay, 2),
    co2SavedKgWeek: round(co2PerDay * workDays, 1),
  };
}

/**
 * Sorts in place: free actions before upgrades, then the biggest dose saving first, then
 * avoid, go, caution. The sort is stable, so remaining ties keep the builders' order.
 */
export function sortItems(items: RoutineItem[]): RoutineItem[] {
  return items.sort((a, b) => {
    if (a.freeAction !== b.freeAction) return a.freeAction ? -1 : 1;
    if (b.impact.doseSavedUg !== a.impact.doseSavedUg) {
      return b.impact.doseSavedUg - a.impact.doseSavedUg;
    }
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  });
}
