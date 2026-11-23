import type { ActionBuilder, ActionProposal, PlanContext } from '../context.js';
import { cloneScenario, type Scenario } from '../scenario.js';
import { commuteModeAction, commuteTimeAction } from './commute.js';
import { exerciseActions } from './exercise.js';
import { filtrationAction } from './filtration.js';
import { cleanCookingUpgrade, heatingUpgrade } from './fuel.js';
import { coilAction, cookingAction, incenseAction, smokingAction } from './homeSources.js';
import { lidAction, ventilateAction } from './weather.js';

/**
 * Every recommendation the engine knows, in the order they are considered. The final list is
 * sorted by impact, and ties keep this order, so changing it changes how the plan reads.
 */
export const ACTION_BUILDERS: readonly ActionBuilder[] = [
  lidAction,
  ventilateAction,
  exerciseActions,
  commuteModeAction,
  commuteTimeAction,
  coilAction,
  incenseAction,
  smokingAction,
  cookingAction,
  filtrationAction,
  heatingUpgrade,
  cleanCookingUpgrade,
];

/** Runs every builder and flattens the proposals; builders that do not apply return null. */
export function collectProposals(
  ctx: PlanContext,
  builders: readonly ActionBuilder[] = ACTION_BUILDERS,
): ActionProposal[] {
  return builders.flatMap((build) => build(ctx) ?? []);
}

/**
 * The baseline with every selected free action applied. Upgrades and advice-only items carry
 * no change, so they never alter the optimised day.
 */
export function optimizedScenario(
  baseline: Scenario,
  proposals: readonly ActionProposal[],
  isSelected: (id: string) => boolean,
): Scenario {
  const optimized = cloneScenario(baseline);
  for (const { item, apply } of proposals) {
    if (apply && item.freeAction && isSelected(item.id)) apply(optimized);
  }
  return optimized;
}
