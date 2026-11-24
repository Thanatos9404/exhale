/**
 * The do-no-harm rule: the one place that decides whether a simulated change may be recommended.
 *
 * A plan must never recommend a change that leaves the household worse off, so every proposal a
 * builder makes passes through here before it can become an item:
 *
 *  - Nobody is made worse off. A change is judged member by member, not on the household sum:
 *    it may not raise anyone's inhaled dose, nor their concentration-hours (the basis of the
 *    cigarette figure). A change that lowers the total by moving dose from one person onto
 *    another is therefore refused, and the dose and cigarette figures of an item can never
 *    disagree in sign.
 *  - It may not raise emissions: a negative CO2e saving is refused.
 *  - Zero is fine. Protective advice with no simulated effect (the smog-lid "keep windows shut"
 *    item, keeping a habit that is already clean) changes nothing and always passes.
 *  - The verdict uses the unrounded simulation, never the rounded figures on the item, so an
 *    impact that reads 0 is a true non-negative.
 *
 * The same test, `harmsNobody`, is reused when actions are stacked (see `combine`), which is
 * what extends the promise from one action on its own to the whole plan and to any what-if
 * selection. Builders with more than one option (airing hour, exercise, commute mode, departure
 * time) call `firstSafe` to propose their best option that passes, instead of one that would
 * only be dropped.
 */
import type { ActionProposal, PlanContext } from './context.js';
import type { HouseholdExposure } from './simulator.js';

/**
 * True when no member breathes more under `after` than under `before`: neither their inhaled
 * dose nor their concentration-hours went up. Equal counts as unharmed.
 */
export function harmsNobody(before: HouseholdExposure, after: HouseholdExposure): boolean {
  for (const [id, was] of before) {
    const now = after.get(id);
    if (now && (now.doseUg > was.doseUg || now.concHours > was.concHours)) return false;
  }
  return true;
}

/**
 * True when a proposal, applied on its own to today's habits, harms nobody and raises no
 * emissions. Advice carries no simulation and always passes.
 */
export function isSafeAlone(ctx: PlanContext, proposal: ActionProposal): boolean {
  const { trial } = proposal;
  if (!trial) return true;
  return trial.co2SavedKg >= 0 && harmsNobody(ctx.baseExposure, trial.exposure);
}

/**
 * For builders with several options: the proposal for the first candidate, in the builder's
 * own order of preference, that is safe on its own. Later candidates are never simulated.
 */
export function firstSafe<T>(
  ctx: PlanContext,
  candidates: readonly T[],
  propose: (candidate: T) => ActionProposal,
): ActionProposal | null {
  for (const candidate of candidates) {
    const proposal = propose(candidate);
    if (isSafeAlone(ctx, proposal)) return proposal;
  }
  return null;
}
