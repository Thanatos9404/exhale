import {
  MODES,
  MODE_LABEL,
  rankModes,
  tripExposure,
  type TripInput,
  type TripResult,
  type TravelMode,
} from '../../science/commute.js';
import { fmtHour } from '../../science/meteo.js';
import type { Member } from '../../profile/schema.js';
import { freeAction, type ActionProposal, type PlanContext } from '../context.js';
import { fmtPm, round } from '../format.js';
import { nextIndexOfHour, type ScenarioChange } from '../scenario.js';

/** Commute advice: a cleaner or lower-carbon mode, an N95, or a cleaner departure time. */

/** Departure shifts the planner will consider, in hours. */
const DEPARTURE_SHIFTS = [-2, -1, 1, 2];

/** A shifted departure must cut street PM2.5 by at least 20% to be worth suggesting. */
const DEPARTURE_GAIN = 0.8;

/** The household's commute, when someone actually travels. */
interface ActiveCommute {
  commuter: Member;
  mode: TravelMode;
  /** Hourly index of the next departure within the horizon, if any. */
  departIdx: number | null;
  /** Street PM2.5 at departure, or now if departure falls outside the horizon, µg/m³. */
  ambient: number;
}

function activeCommute(ctx: PlanContext): ActiveCommute | null {
  const { commute, members } = ctx.household;
  const commuter = members.find((m) => m.id === commute.memberId);
  const mode = commute.mode;
  const travels = commute.distanceKm > 0;
  if (!commuter || mode === 'wfh' || !travels) return null;
  const { sim } = ctx;
  const departIdx = nextIndexOfHour(ctx.hourly, sim.from, sim.to, commute.departHour);
  return { commuter, mode, departIdx, ambient: sim.ambient(departIdx ?? sim.from) };
}

function switchMode(
  ctx: PlanContext,
  trip: ActiveCommute,
  base: TripResult,
  best: TripResult,
): ActionProposal {
  const { commute } = ctx.household;
  const bestOpen = MODES[best.mode].open;
  const n95 = commute.hasN95 || bestOpen;
  const masked = n95 && bestOpen;
  const apply: ScenarioChange = (s) => {
    s.commuteMode = best.mode;
    s.n95 = n95;
  };
  const from = MODE_LABEL[trip.mode];
  const to = MODE_LABEL[best.mode];
  const baseCo2 = round(base.co2Kg * 2, 2);
  const bestCo2 = round(best.co2Kg * 2, 2);
  return freeAction(
    ctx,
    {
      id: 'commute',
      kind: 'commute',
      status: 'go',
      time: fmtHour(commute.departHour),
      endTime: null,
      title: `Swap the ${from.toLowerCase()} for the ${to.toLowerCase()}${masked ? ' with an N95' : ''}`,
      change: {
        before: `${from}, ${commute.distanceKm} km each way · ${baseCo2} kg CO2e a day`,
        after: `${to}${masked ? ' + N95' : ''} · ${bestCo2} kg CO2e a day`,
      },
      detail: `For ${commute.distanceKm} km each way: ${base.minutes} to ${best.minutes} min, ${baseCo2} to ${bestCo2} kg CO2e a day. In-transit air goes from ${fmtPm(base.breathedPm25)} to ${fmtPm(best.breathedPm25)}.`,
    },
    apply,
    [trip.commuter.id],
    // Two trips a day.
    (base.co2Kg - best.co2Kg) * 2,
  );
}

function wearN95(ctx: PlanContext, trip: ActiveCommute): ActionProposal {
  const label = MODE_LABEL[trip.mode];
  const apply: ScenarioChange = (s) => {
    s.n95 = true;
  };
  return freeAction(
    ctx,
    {
      id: 'commute',
      kind: 'commute',
      status: 'caution',
      time: fmtHour(ctx.household.commute.departHour),
      endTime: null,
      title: 'Wear a well-fitted N95 on the commute',
      change: { before: `${label} without a mask`, after: `${label} with a sealed N95` },
      detail: `The ${label.toLowerCase()} is already the best option for this trip, but it is open to street air. A sealed N95 removes roughly 70% of the particles.`,
    },
    apply,
    [trip.commuter.id],
  );
}

/** Switch to the best-ranked mode, or keep an open mode and add an N95. */
export function commuteModeAction(ctx: PlanContext): ActionProposal | null {
  const trip = activeCommute(ctx);
  if (!trip) return null;
  const { commute } = ctx.household;
  const current: TripInput = {
    mode: trip.mode,
    distanceKm: commute.distanceKm,
    ambientPm25: trip.ambient,
    ageGroup: trip.commuter.ageGroup,
    n95: commute.hasN95,
  };
  const [best] = rankModes(current);
  if (best && best.mode !== trip.mode) return switchMode(ctx, trip, tripExposure(current), best);
  if (MODES[trip.mode].open && !commute.hasN95) return wearN95(ctx, trip);
  return null;
}

/** The cleanest nearby departure, if one is clearly better than the usual hour. */
function cleanerDeparture(
  ctx: PlanContext,
  departIdx: number,
  usualPm: number,
): { shift: number; pm25: number } | null {
  const { sim } = ctx;
  let best: { shift: number; pm25: number } | null = null;
  let bestPm = usualPm;
  for (const shift of DEPARTURE_SHIFTS) {
    const idx = departIdx + shift;
    if (idx < sim.from || idx >= sim.to) continue;
    const pm = sim.ambient(idx);
    if (pm < bestPm * DEPARTURE_GAIN) {
      bestPm = pm;
      best = { shift, pm25: pm };
    }
  }
  return best;
}

/** For flexible hours, leave up to two hours earlier or later when the street is cleaner. */
export function commuteTimeAction(ctx: PlanContext): ActionProposal | null {
  const trip = activeCommute(ctx);
  const { commute } = ctx.household;
  if (!trip || !commute.flexible || trip.departIdx === null) return null;
  const better = cleanerDeparture(ctx, trip.departIdx, trip.ambient);
  if (!better) return null;

  const apply: ScenarioChange = (s) => {
    s.departShift = better.shift;
  };
  const t = fmtHour(commute.departHour + better.shift);
  const usual = fmtHour(commute.departHour);
  return freeAction(
    ctx,
    {
      id: 'commute-time',
      kind: 'commute',
      status: 'go',
      time: t,
      endTime: null,
      title: `Leave at ${t} instead of ${usual}`,
      change: {
        before: `Leave at ${usual} · ${fmtPm(trip.ambient)} on the street`,
        after: `Leave at ${t} · ${fmtPm(better.pm25)} on the street`,
      },
      detail: `Your hours are flexible. Street PM2.5 drops from ${fmtPm(trip.ambient)} to ${fmtPm(better.pm25)} by ${t} as the morning lid breaks up.`,
    },
    apply,
    [trip.commuter.id],
  );
}
