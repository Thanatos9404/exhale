import { simulateRoom, type Purifier } from '../../science/indoor.js';
import { fmtHour } from '../../science/meteo.js';
import { freeAction, upgrade, type ActionProposal, type PlanContext } from '../context.js';
import { hourAt, round } from '../format.js';
import type { ScenarioChange } from '../scenario.js';

/** Filtration: run the purifier the household owns, or build a cheap box-fan filter. */

function runPurifier(ctx: PlanContext, purifier: Exclude<Purifier, 'none'>): ActionProposal {
  const { home } = ctx.household;
  const { sim } = ctx;
  const apply: ScenarioChange = (s) => {
    s.purifier = purifier;
  };
  const room = simulateRoom({
    outdoorPm25: sim.ambient(sim.from),
    areaM2: home.areaM2,
    ventilation: home.ventilation,
    windowsOpen: false,
    purifier,
  });
  // Three time constants is roughly 95% of the way to the new steady state.
  const settleMin = Math.round(room.timeConstantMin * 3);
  return freeAction(
    ctx,
    {
      id: 'purifier',
      kind: 'home',
      status: 'go',
      time: fmtHour(hourAt(ctx.hourly, sim.from)),
      endTime: null,
      title: 'Run the purifier on high with the bedroom door shut',
      change: { before: 'Purifier off or on low', after: 'Purifier on high, bedroom door shut' },
      detail: `In a ${home.areaM2} m² room it adds ${round(room.purifierAch, 1)} clean-air changes an hour and settles in about ${settleMin} min. Running it only at night leaves the evening peak untouched.`,
    },
    apply,
  );
}

function buildBoxFanFilter(ctx: PlanContext): ActionProposal {
  return upgrade(
    ctx,
    {
      id: 'diy-filter',
      kind: 'upgrade',
      status: 'caution',
      time: null,
      endTime: null,
      title: 'Build a box-fan filter for the bedroom',
      change: { before: 'No filtration', after: 'Box-fan filter running in the bedroom' },
      detail:
        'Tape four MERV-13 filters around a box fan (a Corsi-Rosenthal box). It moves roughly 550 m³ of filtered air an hour, comparable to a large purifier, for the cost of the filters.',
    },
    (s) => {
      s.purifier = 'diy';
    },
  );
}

/** A free action when a purifier is already owned, otherwise a paid upgrade. */
export function filtrationAction(ctx: PlanContext): ActionProposal {
  const { purifier } = ctx.household.home;
  return purifier === 'none' ? buildBoxFanFilter(ctx) : runPurifier(ctx, purifier);
}
