import type { AirSnapshot } from '../air/types.js';
import { dirtiestWindow } from '../science/meteo.js';
import type { Household } from '../profile/schema.js';
import { collectProposals, optimizedScenario } from './actions/registry.js';
import { createPlanContext } from './context.js';
import { hourSpan } from './format.js';
import { impactBetween } from './impact.js';
import { currentConditions, headlineFor, lidSummary, riskNow, windowSummary } from './summary.js';
import {
  memberSummaries,
  planTotals,
  selectedCo2PerDay,
  selectionFrom,
  sortItems,
} from './totals.js';
import type { PlanOptions, PlanResult } from './types.js';

/**
 * The decision engine. Given live air data and a household profile it:
 *  1. simulates every member's next 24 hours, hour by hour (where they are, how hard they breathe),
 *  2. tests each candidate change on its own against that baseline,
 *  3. keeps the changes that help and reports their exact impact.
 * Every number the UI or the AI shows comes from here, so explanations stay grounded and testable.
 *
 * This module is the public entry point. The work lives next to it: `simulator` (exposure),
 * `actions/*` (one builder per recommendation), `totals` and `summary` (aggregation and text).
 */

export { HORIZON_HOURS } from './simulator.js';
export type {
  Impact,
  MemberSummary,
  PlanOptions,
  PlanResult,
  RoutineItem,
  RoutineKind,
  RoutineStatus,
} from './types.js';

/**
 * Builds the day's plan for a household. Every candidate action is simulated on its own for
 * its impact; the totals apply all free actions together, or only `options.only` when given.
 */
export function buildPlan(
  household: Household,
  air: AirSnapshot,
  now: Date = new Date(),
  options: PlanOptions = {},
): PlanResult {
  const { hourly, nowIndex } = air;
  const ctx = createPlanContext(household, air);
  const { sim, baseExposure, everyone } = ctx;
  const isSelected = selectionFrom(options.only);

  const proposals = collectProposals(ctx);
  const items = proposals.map((p) => p.item);
  const optimizedExposure = sim.household(optimizedScenario(ctx.baseline, proposals, isSelected));
  const totalImpact = impactBetween(baseExposure, optimizedExposure, everyone);
  // Summed before sorting so the floating-point order matches the builders' order.
  const co2PerDay = selectedCo2PerDay(items, isSelected);
  sortItems(items);

  const risk = riskNow(hourly, nowIndex, household.standard);
  const lid = lidSummary(hourly, ctx.lids);
  const cleanWindow = windowSummary(hourly, ctx.clean);
  return {
    placeLabel: air.place.label,
    generatedAt: now.toISOString(),
    horizon: hourSpan(hourly, sim.from, sim.to),
    risk,
    current: currentConditions(hourly[nowIndex]),
    lid,
    cleanWindow,
    worstWindow: windowSummary(hourly, dirtiestWindow(hourly, sim.from, sim.to, 3)),
    headline: headlineFor(lid, cleanWindow, risk, totalImpact.exposureCutPct),
    items,
    members: memberSummaries(household.members, baseExposure, optimizedExposure),
    totals: planTotals(baseExposure, optimizedExposure, totalImpact, co2PerDay, household.commute),
  };
}
