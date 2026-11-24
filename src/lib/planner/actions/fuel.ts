/** Fuel upgrades for heating and cooking. They cost money, so they stay out of the free total. */
import { SOURCE_RATE } from '../../science/indoor.js';
import { upgrade, type ActionProposal, type PlanContext } from '../context.js';

/** Replace a wood or coal heater, which fills a sealed room with smoke. */
export function heatingUpgrade(ctx: PlanContext): ActionProposal | null {
  const { heating } = ctx.household.home;
  if (heating !== 'wood' && heating !== 'coal') return null;
  return upgrade(
    ctx,
    {
      id: 'heating',
      kind: 'upgrade',
      status: 'avoid',
      time: '19:00',
      endTime: null,
      title: `Replace the ${heating} heater with an electric one or extra layers`,
      change: { before: `${heating} heater indoors`, after: 'Electric heater or extra layers' },
      detail:
        'Solid-fuel heaters fill a sealed room with smoke and carbon monoxide, and their smoke joins the city-wide lid outside.',
    },
    (s) => {
      s.heatingRate = 0;
    },
  );
}

/** Move cooking off a biomass chulha to LPG or induction. */
export function cleanCookingUpgrade(ctx: PlanContext): ActionProposal | null {
  if (ctx.household.home.cooking !== 'biomass') return null;
  return upgrade(
    ctx,
    {
      id: 'clean-cooking',
      kind: 'upgrade',
      status: 'caution',
      time: null,
      endTime: null,
      title: 'Move cooking from the chulha to LPG or induction',
      change: { before: 'Cooking on a chulha', after: 'Cooking on LPG or induction' },
      detail:
        'Wood and dung stoves are among the largest single sources of household PM2.5 in India.',
    },
    (s) => {
      s.cookingRate = SOURCE_RATE.fryingGas;
    },
  );
}
