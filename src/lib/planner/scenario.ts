import type { HourPoint } from '../air/types.js';
import type { CommuteMode } from '../science/commute.js';
import { SOURCE_RATE, type Purifier } from '../science/indoor.js';
import { hourOf } from '../science/meteo.js';
import type { Household } from '../profile/schema.js';

/**
 * A scenario is one version of the household's day: today's habits (the baseline) or the
 * baseline with one or more recommended changes applied. The simulator plays it out.
 */
export interface Scenario {
  /** Hourly index of each member's exercise, 'indoor' to move it inside, or null for none. */
  exercise: Record<string, number | 'indoor' | null>;
  /** Hourly index at which windows are opened to air the house, or null if never. */
  airingIdx: number | null;
  commuteMode: CommuteMode;
  /** Whether the commuter wears a sealed N95 on open modes. */
  n95: boolean;
  /** Hours added to both commute legs (negative leaves earlier). */
  departShift: number;
  purifier: Purifier;
  /** Mosquito coil burning overnight. */
  coil: boolean;
  /** Incense lit in the evening. */
  incense: boolean;
  /** Someone smokes indoors. */
  smoking: boolean;
  /** Fraction of cooking emissions removed at source. */
  cookingCapture: number;
  /** Cooking emissions while a meal is on, µg/h. */
  cookingRate: number;
  /** Heater emissions while it runs, µg/h. */
  heatingRate: number;
}

/** A change to try on a copy of a scenario, such as moving the airing hour. */
export type ScenarioChange = (scenario: Scenario) => void;

/** Cooking on electric, as a share of the PM2.5 from frying on gas. */
const ELECTRIC_COOKING_SHARE = 0.7;

/** Wood or coal heater emissions while running, µg/h. Order-of-magnitude, like SOURCE_RATE. */
const SOLID_FUEL_HEATER_RATE = 60_000;

/** Gas heater emissions while running, µg/h. */
const GAS_HEATER_RATE = 2_000;

/** Copy that can be changed without touching the original (exercise slots included). */
export function cloneScenario(scenario: Scenario): Scenario {
  return { ...scenario, exercise: { ...scenario.exercise } };
}

/** First index in `hourly[from..to)` whose local hour of day is `hod`, or null. */
export function nextIndexOfHour(
  hourly: readonly HourPoint[],
  from: number,
  to: number,
  hod: number,
): number | null {
  const offset = hourly.slice(from, to).findIndex((point) => hourOf(point.time) === hod);
  return offset < 0 ? null : from + offset;
}

/** Cooking emissions for the household's fuel, µg/h. */
export function cookingRateFor(cooking: Household['home']['cooking']): number {
  if (cooking === 'biomass') return SOURCE_RATE.biomassStove;
  if (cooking === 'lpg') return SOURCE_RATE.fryingGas;
  return SOURCE_RATE.fryingGas * ELECTRIC_COOKING_SHARE;
}

/** Heater emissions for the household's heating, µg/h. Electric heating adds none. */
export function heatingRateFor(heating: Household['home']['heating']): number {
  if (heating === 'wood' || heating === 'coal') return SOLID_FUEL_HEATER_RATE;
  if (heating === 'gas') return GAS_HEATER_RATE;
  return 0;
}

/** Today's habits over the simulated hours `hourly[from..to)`, before any recommendation. */
export function baselineScenario(
  household: Household,
  hourly: readonly HourPoint[],
  from: number,
  to: number,
): Scenario {
  const { home, commute } = household;
  const exercise: Scenario['exercise'] = {};
  for (const m of household.members) {
    exercise[m.id] =
      m.exercise === 'none' ? null : nextIndexOfHour(hourly, from, to, m.exerciseHour);
  }
  return {
    exercise,
    airingIdx: nextIndexOfHour(hourly, from, to, home.airingHour),
    commuteMode: commute.mode,
    n95: commute.hasN95,
    departShift: 0,
    purifier: 'none',
    coil: home.mosquitoCoil,
    incense: home.incense,
    smoking: home.indoorSmoking,
    // Baseline assumes the hood (if any) is not run consistently; turning it on is a recommendation.
    cookingCapture: 0,
    cookingRate: cookingRateFor(home.cooking),
    heatingRate: heatingRateFor(home.heating),
  };
}
