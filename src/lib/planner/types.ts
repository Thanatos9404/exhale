import type { AqiLevel } from '../air/aqi.js';
import type { Pollutant } from '../air/types.js';
import type { Dispersion } from '../science/meteo.js';
import type { Household } from '../profile/schema.js';

/** Public shapes of a plan. The UI, the AI prompts and the rule-based fallback all read these. */

/** Which part of the day a recommendation changes; drives the icon and grouping in the UI. */
export type RoutineKind = 'ventilate' | 'exercise' | 'commute' | 'protect' | 'home' | 'upgrade';

/** Traffic-light verdict on the habit: keep it, adjust it with care, or stop it. */
export type RoutineStatus = 'go' | 'caution' | 'avoid';

/** What one recommendation saves against the unchanged day. */
export interface Impact {
  /** µg of PM2.5 not inhaled today, summed over affected members. */
  doseSavedUg: number;
  /** Share of the affected members' daily dose removed, 0 to 100. */
  exposureCutPct: number;
  /** Berkeley Earth cigarette equivalents of the concentration-hours avoided. */
  cigarettesAvoided: number;
  /** kg CO2e saved per day. */
  co2SavedKg: number;
}

/** One recommendation in the daily routine. */
export interface RoutineItem {
  /** Stable id such as "ventilate" or "exercise-kid"; what-if selections refer to it. */
  id: string;
  kind: RoutineKind;
  status: RoutineStatus;
  /** Local "HH:00" start, if the action is time-bound. */
  time: string | null;
  /** Local "HH:00" end, for actions that cover a window. */
  endTime: string | null;
  title: string;
  /** One or two sentences that justify the advice with the forecast numbers. */
  detail: string;
  /** Household members the advice and its impact apply to. */
  memberIds: string[];
  impact: Impact;
  /** Upgrades cost money or effort and are kept out of the free-actions total. */
  freeAction: boolean;
  /** The habit and its replacement, for diff views. */
  change?: { before: string; after: string };
}

/** One member's day before and after the plan. */
export interface MemberSummary {
  id: string;
  name: string;
  /** Sensitivity multiplier from age and conditions; 1 is a healthy adult. */
  sensitivity: number;
  /** Highest outdoor PM2.5 for scheduled exercise, µg/m³. */
  pm25Limit: number;
  /** Dose they would inhale breathing WHO-guideline air on the same schedule, µg. */
  budgetUg: number;
  /** Inhaled PM2.5 over the horizon with today's habits, µg. */
  baselineDoseUg: number;
  /** Inhaled PM2.5 over the horizon with the selected free actions, µg. */
  optimizedDoseUg: number;
  /** Berkeley Earth cigarette equivalents of the baseline day. */
  baselineCigarettes: number;
  /** Berkeley Earth cigarette equivalents of the optimised day. */
  optimizedCigarettes: number;
}

/** Everything the dashboard and the AI need for one household and one forecast. */
export interface PlanResult {
  placeLabel: string;
  /** ISO timestamp of when the plan was built. */
  generatedAt: string;
  /** Local "HH:00" bounds of the simulated hours. */
  horizon: { start: string; end: string };
  /** AQI for the current hour in the household's chosen standard. */
  risk: {
    aqi: number;
    level: AqiLevel;
    label: string;
    advice: string;
    dominant: Pollutant;
    standard: Household['standard'];
  };
  /** Readings for the current hour. */
  current: {
    /** µg/m³. */
    pm25: number | null;
    /** Boundary-layer height, metres. */
    blh: number | null;
    /** Wind speed, km/h. */
    wind: number | null;
    /** Boundary-layer height × wind speed, m²/s. */
    ventilationCoefficient: number | null;
    dispersion: Dispersion | null;
  };
  /** Smog-lid spans in the horizon, with the lowest mixing height of each, metres. */
  lid: { spans: { start: string; end: string; minBlh: number }[]; stagnantHours: number };
  /** Cleanest hour between 09:00 and 17:00, mean PM2.5 in µg/m³. */
  cleanWindow: { start: string; end: string; pm25: number } | null;
  /** Dirtiest three-hour run, mean PM2.5 in µg/m³. */
  worstWindow: { start: string; end: string; pm25: number } | null;
  headline: string;
  /** Free actions first, biggest dose saving first. */
  items: RoutineItem[];
  members: MemberSummary[];
  /** Household totals; the optimised figures honour any what-if selection. */
  totals: {
    baselineDoseUg: number;
    optimizedDoseUg: number;
    exposureCutPct: number;
    cigarettesAvoided: number;
    co2SavedKgDay: number;
    /** Daily saving times commuting days per week. */
    co2SavedKgWeek: number;
  };
}

/** Options for `buildPlan`. */
export interface PlanOptions {
  /** Apply only these free actions to the optimised day (what-if analysis). Default: all. */
  only?: ReadonlySet<string>;
}
