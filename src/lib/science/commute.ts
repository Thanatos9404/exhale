/**
 * Commute modes with per-passenger emission and in-transit exposure factors.
 * CO2e values are India-oriented per passenger-km approximations; exposure factors are the
 * ratio of in-vehicle to ambient PM2.5 reported across urban commuter studies. Both are
 * listed as assumptions in the README.
 */
import {
  BREATHING_RATE,
  cigarettesFromConcHours,
  type Activity,
  type AgeGroup,
} from './exposure.js';

/** How the commuter travels; 'wfh' means no commute. */
export type CommuteMode =
  'wfh' | 'walk' | 'cycle' | 'metro' | 'bus' | 'auto' | 'twoWheeler' | 'car' | 'ev';

/** Travel mode, excluding working from home. */
export type TravelMode = Exclude<CommuteMode, 'wfh'>;

/** Emission, exposure and practicality figures for one travel mode. */
export interface ModeSpec {
  label: string;
  /** kg CO2e per passenger-km. */
  co2PerKm: number;
  /** In-transit PM2.5 relative to the ambient reading. */
  exposureFactor: number;
  /** Breathing-rate activity level while travelling. */
  activity: Activity;
  /** Typical door-to-door speed in a congested Indian city, km/h. */
  speedKmh: number;
  /** Open to street air, so a respirator helps. */
  open: boolean;
  /** Longest trip this mode is sensible for, km. */
  maxKm: number;
}

/** Figures for every travel mode, in the order `rankModes` considers them. */
export const MODES: Record<TravelMode, ModeSpec> = {
  walk: {
    label: 'Walk',
    co2PerKm: 0,
    exposureFactor: 1.25,
    activity: 'light',
    speedKmh: 4.8,
    open: true,
    maxKm: 3,
  },
  cycle: {
    label: 'Cycle',
    co2PerKm: 0,
    exposureFactor: 1.3,
    activity: 'moderate',
    speedKmh: 14,
    open: true,
    maxKm: 12,
  },
  metro: {
    label: 'Metro',
    co2PerKm: 0.031,
    exposureFactor: 0.7,
    activity: 'light',
    speedKmh: 28,
    open: true,
    maxKm: 60,
  },
  bus: {
    label: 'Bus',
    co2PerKm: 0.035,
    exposureFactor: 1.1,
    activity: 'rest',
    speedKmh: 16,
    open: true,
    maxKm: 60,
  },
  auto: {
    label: 'Auto-rickshaw',
    co2PerKm: 0.07,
    exposureFactor: 1.45,
    activity: 'rest',
    speedKmh: 22,
    open: true,
    maxKm: 20,
  },
  twoWheeler: {
    label: 'Two-wheeler',
    co2PerKm: 0.055,
    exposureFactor: 1.4,
    activity: 'rest',
    speedKmh: 26,
    open: true,
    maxKm: 40,
  },
  car: {
    label: 'Car (petrol)',
    co2PerKm: 0.17,
    exposureFactor: 0.65,
    activity: 'rest',
    speedKmh: 24,
    open: false,
    maxKm: 100,
  },
  ev: {
    label: 'Electric car',
    co2PerKm: 0.085,
    exposureFactor: 0.65,
    activity: 'rest',
    speedKmh: 24,
    open: false,
    maxKm: 100,
  },
};

/** Display name of every commute mode, working from home included. */
export const MODE_LABEL: Record<CommuteMode, string> = {
  wfh: 'Work from home',
  walk: MODES.walk.label,
  cycle: MODES.cycle.label,
  metro: MODES.metro.label,
  bus: MODES.bus.label,
  auto: MODES.auto.label,
  twoWheeler: MODES.twoWheeler.label,
  car: MODES.car.label,
  ev: MODES.ev.label,
};

/** True for a key of `MODES`, i.e. any commute mode except working from home. */
export function isTravelMode(mode: string): mode is TravelMode {
  return Object.hasOwn(MODES, mode);
}

/** Travel modes in `MODES` order. */
const TRAVEL_MODES: readonly TravelMode[] = Object.keys(MODES).filter(isTravelMode);

/** A well-fitted N95 cuts inhaled PM2.5 by roughly 70% in real-world use. */
export const N95_FACTOR = 0.3;

/** One trip to evaluate. */
export interface TripInput {
  mode: TravelMode;
  distanceKm: number;
  /** Ambient PM2.5 during the trip, µg/m³. */
  ambientPm25: number;
  ageGroup: AgeGroup;
  /** Wears a sealed N95; only helps on modes open to street air. */
  n95: boolean;
}

/** Time, exposure and emissions for one trip, one way. */
export interface TripResult {
  mode: TravelMode;
  /** Door-to-door minutes. */
  minutes: number;
  /** In-transit PM2.5 the traveller actually breathes, after any mask. */
  breathedPm25: number;
  /** Inhaled PM2.5 over the trip, µg. */
  doseUg: number;
  /** kg CO2e per passenger. */
  co2Kg: number;
  /** Berkeley Earth cigarette equivalents of the trip. */
  cigarettes: number;
}

/** Minutes, inhaled dose and CO2e of a single trip. */
export function tripExposure(input: TripInput): TripResult {
  const spec = MODES[input.mode];
  const km = Math.max(0, input.distanceKm);
  const hours = km / spec.speedKmh;
  const mask = input.n95 && spec.open ? N95_FACTOR : 1;
  const breathed = Math.max(0, input.ambientPm25) * spec.exposureFactor * mask;
  const rate = BREATHING_RATE[input.ageGroup][spec.activity];
  return {
    mode: input.mode,
    minutes: Math.round(hours * 60),
    breathedPm25: breathed,
    doseUg: breathed * rate * hours,
    co2Kg: spec.co2PerKm * km,
    cigarettes: cigarettesFromConcHours(breathed * hours),
  };
}

/**
 * CO2 of an option relative to the current mode. When the current mode emits nothing, an
 * option that emits anything counts as twice as bad and one that emits nothing as equal.
 */
function relativeCo2(co2Kg: number, baseCo2Kg: number): number {
  if (baseCo2Kg > 0) return co2Kg / baseCo2Kg;
  return co2Kg > 0 ? 2 : 1;
}

/** A ranked alternative. */
export interface CommuteOption extends TripResult {
  /** Weighted dose, CO2 and time relative to the current mode; lower is better. */
  score: number;
}

/**
 * Ranks modes for one trip by a blend of dose and CO2, normalised to the current mode,
 * and drops options that would more than add 60% (plus 15 min) to travel time.
 */
export function rankModes(current: TripInput): CommuteOption[] {
  const base = tripExposure(current);
  const maxMinutes = base.minutes * 1.6 + 15;
  const options: CommuteOption[] = [];
  for (const mode of TRAVEL_MODES) {
    if (current.distanceKm > MODES[mode].maxKm) continue;
    const r = tripExposure({ ...current, mode, n95: current.n95 || MODES[mode].open });
    if (r.minutes > maxMinutes && mode !== current.mode) continue;
    const doseRel = base.doseUg > 0 ? r.doseUg / base.doseUg : 1;
    const co2Rel = relativeCo2(r.co2Kg, base.co2Kg);
    const timeRel = base.minutes > 0 ? r.minutes / base.minutes : 1;
    options.push({ ...r, score: doseRel * 0.5 + co2Rel * 0.35 + timeRel * 0.15 });
  }
  return options.sort((x, y) => x.score - y.score);
}
