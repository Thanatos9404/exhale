/**
 * The list of recommendation builders and the one step every proposal passes through: each
 * builder's proposal is vetted by the do-no-harm rule, then the survivors are settled into a
 * list that is honest as a whole.
 */
import { settle } from '../combine.js';
import type { ActionBuilder, ActionProposal, PlanContext } from '../context.js';
import { isSafeAlone } from '../guard.js';
import { commuteModeAction, commuteTimeAction } from './commute.js';
import { exerciseActions } from './exercise.js';
import { filtrationAction } from './filtration.js';
import { cleanCookingUpgrade, heatingUpgrade } from './fuel.js';
import { coilAction, cookingAction, incenseAction, smokingAction } from './homeSources.js';
import { lidAction, ventilateAction } from './weather.js';

/**
 * Every recommendation the engine knows, in the order they are considered. The order matters
 * twice: when two actions clash the earlier one is kept, and the final list is sorted by impact
 * with ties keeping this order, so changing it changes how the plan reads.
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

/**
 * Runs every builder (those that do not apply return null) and keeps only what the plan may
 * recommend. This is the single gate between a builder and the plan:
 *  1. a proposal that on its own would raise any member's dose or concentration-hours, or the
 *     household's CO2e, is dropped (`isSafeAlone`), whichever builder made it;
 *  2. the rest are settled so they also hold up together (`settle`).
 */
export function collectProposals(
  ctx: PlanContext,
  builders: readonly ActionBuilder[] = ACTION_BUILDERS,
): ActionProposal[] {
  const proposed = builders.flatMap((build) => build(ctx) ?? []);
  return settle(
    ctx,
    proposed.filter((proposal) => isSafeAlone(ctx, proposal)),
  );
}
