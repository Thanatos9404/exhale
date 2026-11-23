import { EXHAUST_CAPTURE, SOURCE_RATE, sourceIncrement } from '../../science/indoor.js';
import { freeAction, type ActionProposal, type PlanContext } from '../context.js';
import { fmtPm } from '../format.js';
import type { ScenarioChange } from '../scenario.js';

/** Indoor smoke the household makes itself: coils, incense, cigarettes and cooking. */

/** Share of cooking smoke kept out of the house by lids and a cracked kitchen window. */
const CONTAINMENT_CAPTURE = 0.3;

/** Extra µg/m³ a source adds to a closed room in this home, without a purifier. */
function closedRoomIncrement(ctx: PlanContext, sourceUgPerHour: number): number {
  const { home } = ctx.household;
  return sourceIncrement(sourceUgPerHour, home.ventilation, 'none', home.areaM2);
}

/** Replace an overnight mosquito coil, which emits as much PM2.5 as 75 to 137 cigarettes. */
export function coilAction(ctx: PlanContext): ActionProposal | null {
  if (!ctx.household.home.mosquitoCoil) return null;
  const apply: ScenarioChange = (s) => {
    s.coil = false;
  };
  const added = fmtPm(closedRoomIncrement(ctx, SOURCE_RATE.mosquitoCoil));
  return freeAction(
    ctx,
    {
      id: 'coil',
      kind: 'home',
      status: 'avoid',
      time: '22:00',
      endTime: null,
      title: 'Swap the mosquito coil for a net or plug-in repellent',
      change: {
        before: 'Mosquito coil burning 22:00 to 06:00',
        after: 'Bed net or plug-in repellent',
      },
      detail: `A burning coil adds about ${added} to the bedroom all night. One coil releases as much PM2.5 mass as 75 to 137 cigarettes (Liu et al., 2003).`,
    },
    apply,
  );
}

/** Skip the evening incense stick, which burns inside an already smoggy, closed room. */
export function incenseAction(ctx: PlanContext): ActionProposal | null {
  if (!ctx.household.home.incense) return null;
  const apply: ScenarioChange = (s) => {
    s.incense = false;
  };
  const added = fmtPm(closedRoomIncrement(ctx, SOURCE_RATE.incense));
  return freeAction(
    ctx,
    {
      id: 'incense',
      kind: 'home',
      status: 'caution',
      time: '19:00',
      endTime: null,
      title: 'Light a diya instead of incense tonight',
      change: { before: 'Incense stick at 19:00', after: 'A diya, or nothing' },
      detail: `An incense stick adds roughly ${added} to a closed room for the hour it burns, on top of the smog that already leaked in.`,
    },
    apply,
  );
}

/** Move smoking outside; with windows shut for the smog, indoor smoke lingers for hours. */
export function smokingAction(ctx: PlanContext): ActionProposal | null {
  if (!ctx.household.home.indoorSmoking) return null;
  const apply: ScenarioChange = (s) => {
    s.smoking = false;
  };
  return freeAction(
    ctx,
    {
      id: 'smoking',
      kind: 'home',
      status: 'avoid',
      time: null,
      endTime: null,
      title: 'Smoke outside, never in a shut house',
      change: { before: 'Smoking indoors', after: 'Smoking outside only' },
      detail:
        'With windows closed for the smog, smoke has nowhere to go and everyone breathes it for hours.',
    },
    apply,
  );
}

/** Wording for kitchens with and without an exhaust hood. */
function cookingAdvice(hasHood: boolean): { after: string; title: string; detail: string } {
  if (hasHood) {
    return {
      after: 'Hood on high while cooking',
      title: 'Run the kitchen exhaust from first flame to 10 min after',
      detail:
        'A hood running on high removes about 60% of frying smoke at source, before it spreads to bedrooms.',
    };
  }
  return {
    after: 'Lids on, kitchen window cracked, door shut',
    title: 'Cook with lids on and crack only the kitchen window',
    detail:
      'No exhaust fan, so contain it: lids cut oil smoke, and a cracked kitchen window with the door shut keeps the plume out of the rest of the house.',
  };
}

/** Capture cooking smoke at source: run the hood, or contain the plume when there is none. */
export function cookingAction(ctx: PlanContext): ActionProposal {
  const hasHood = ctx.household.home.kitchenExhaust;
  const capture = hasHood ? EXHAUST_CAPTURE : CONTAINMENT_CAPTURE;
  const apply: ScenarioChange = (s) => {
    s.cookingCapture = capture;
  };
  const { after, title, detail } = cookingAdvice(hasHood);
  return freeAction(
    ctx,
    {
      id: 'cooking',
      kind: 'home',
      status: 'caution',
      time: '20:00',
      endTime: null,
      change: { before: 'Cooking with no extraction', after },
      title,
      detail,
    },
    apply,
  );
}
