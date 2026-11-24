/**
 * Combines free actions into one day, and settles which of them a plan may list.
 *
 * Each action is scored on its own, but actions meet in the same hours: airing can land on the
 * hour someone exercises indoors, a later departure changes who is home while the windows are
 * open, a cleaner kitchen shrinks what leaving the house was saving. Two changes that each help
 * can therefore hurt together. So actions are stacked one at a time, in the order the builders
 * are listed, and a step is only taken if it harms nobody given the steps already taken. By
 * induction every member ends at or below their baseline, for the full plan and for any what-if
 * selection.
 */
import type { ActionProposal, PlanContext } from './context.js';
import { harmsNobody } from './guard.js';
import { cloneScenario, type Scenario } from './scenario.js';
import type { HouseholdExposure } from './simulator.js';
import { totalDose } from './totals.js';

/** The household's day once the selected free actions are stacked onto today's habits. */
export interface CombinedDay {
  scenario: Scenario;
  /** Every member's exposure under `scenario`, unrounded. */
  exposure: HouseholdExposure;
  /** Ids of the selected free actions that were taken; a clashing one is left out. */
  applied: ReadonlySet<string>;
}

const everything = (): boolean => true;

/**
 * The baseline with every selected free action applied in order. An action is skipped when,
 * on top of the ones before it, it would raise anyone's dose or concentration-hours. Upgrades
 * and advice carry no change, so they never alter the day.
 */
export function combine(
  ctx: PlanContext,
  proposals: readonly ActionProposal[],
  isSelected: (id: string) => boolean = everything,
): CombinedDay {
  let scenario = ctx.baseline;
  let exposure = ctx.baseExposure;
  const applied = new Set<string>();
  for (const { item, apply } of proposals) {
    if (!apply || !item.freeAction || !isSelected(item.id)) continue;
    const next = cloneScenario(scenario);
    apply(next);
    const nextExposure = ctx.sim.household(next);
    if (!harmsNobody(exposure, nextExposure)) continue;
    scenario = next;
    exposure = nextExposure;
    applied.add(item.id);
  }
  return { scenario, exposure, applied };
}

/** The taken action whose removal would lower the household's dose the most, if any would. */
function counterproductive(
  ctx: PlanContext,
  proposals: readonly ActionProposal[],
  full: CombinedDay,
): ActionProposal | undefined {
  let lowest = totalDose(full.exposure);
  let found: ActionProposal | undefined;
  for (const proposal of proposals) {
    const { id } = proposal.item;
    if (!full.applied.has(id)) continue;
    const without = totalDose(combine(ctx, proposals, (other) => other !== id).exposure);
    if (without < lowest) {
      lowest = without;
      found = proposal;
    }
  }
  return found;
}

/**
 * The proposals a plan may list, so that the list is honest as a whole:
 *  - every listed free action is really taken when all are selected (one that clashes with an
 *    earlier action is dropped rather than shown with a saving the plan does not deliver);
 *  - deselecting any single listed action never lowers the household's total dose (one that
 *    only helps on its own, and drags the full plan down, is dropped).
 * Proposals are removed one at a time until both hold, so the result is stable.
 */
export function settle(ctx: PlanContext, proposals: readonly ActionProposal[]): ActionProposal[] {
  const full = combine(ctx, proposals);
  const clashing = proposals.find(
    ({ item, apply }) => apply && item.freeAction && !full.applied.has(item.id),
  );
  const drop = clashing ?? counterproductive(ctx, proposals, full);
  if (!drop) return [...proposals];
  return settle(
    ctx,
    proposals.filter((proposal) => proposal !== drop),
  );
}
