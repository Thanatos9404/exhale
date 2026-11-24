/**
 * Plan helpers for the Impact page: which changes can be shown as a diff, which are switched on,
 * and the day recomputed by the engine with only those applied. Pure functions with no React.
 */
import type { AirSnapshot } from '@/lib/air/types';
import {
  buildPlan,
  type MemberSummary,
  type PlanResult,
  type RoutineItem,
} from '@/lib/planner/engine';
import type { Household } from '@/lib/profile/schema';

/** A free routine change that carries a before/after diff. */
export type DiffItem = RoutineItem & { change: NonNullable<RoutineItem['change']> };

/** The free changes in a plan that can be shown as a diff, in plan order. */
export function diffItems(plan: PlanResult): DiffItem[] {
  return plan.items.filter((i): i is DiffItem => i.freeAction && i.change !== undefined);
}

/** Ids of the free actions the user has left switched on. */
export function enabledFreeActions(plan: PlanResult, off: ReadonlySet<string>): Set<string> {
  return new Set(plan.items.filter((i) => i.freeAction && !off.has(i.id)).map((i) => i.id));
}

/** Recomputes the day with only the switched-on free actions applied. */
export function buildSelectedPlan(
  household: Household,
  air: AirSnapshot,
  full: PlanResult,
  off: ReadonlySet<string>,
): PlanResult {
  return buildPlan(household, air, new Date(), { only: enabledFreeActions(full, off) });
}

/** Today's inhaled dose as a share of the member's WHO-guideline budget, in percent. */
export function budgetPercent(member: MemberSummary): number {
  return (member.optimizedDoseUg / Math.max(1, member.budgetUg)) * 100;
}
