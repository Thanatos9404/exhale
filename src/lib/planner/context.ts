/**
 * The shared context of one plan (household, forecast, baseline day, the meteorology the advice
 * is anchored to) and the three shapes a builder's proposal can take: free action, paid upgrade
 * or plain advice. Built once per plan.
 */
import type { AirSnapshot, HourPoint } from '../air/types.js';
import {
  cleanestWindow,
  lidSpans,
  type LidSpan,
  type Window as PmWindow,
} from '../science/meteo.js';
import type { Household } from '../profile/schema.js';
import { impactBetween, noImpact } from './impact.js';
import { baselineScenario, cloneScenario, type Scenario, type ScenarioChange } from './scenario.js';
import { Simulator, type HouseholdExposure } from './simulator.js';
import type { RoutineItem } from './types.js';

/** Local hours of day, inclusive, between which the house may be aired. */
export const AIRING_WINDOW = { dayStart: 9, dayEnd: 17 };

/** What every recommendation builder needs. */
export interface PlanContext {
  readonly household: Household;
  readonly hourly: readonly HourPoint[];
  readonly sim: Simulator;
  /** Today's habits, unchanged. */
  readonly baseline: Scenario;
  readonly baseExposure: HouseholdExposure;
  /** Every member id, for household-wide advice. */
  readonly everyone: string[];
  /** Cleanest single hour between 09:00 and 17:00, for airing the house. */
  readonly clean: PmWindow | null;
  /** Cleanest single daylight hour, 07:00 to 18:00, for moving exercise. */
  readonly cleanDaylight: PmWindow | null;
  /** Runs of smog-lid hours in the horizon. */
  readonly lids: LidSpan[];
  /** Every member's day with `change` alone applied to the baseline, unrounded. */
  simulate(change: ScenarioChange): HouseholdExposure;
}

/**
 * What a proposed change does on its own, before any rounding. The do-no-harm rule in `guard`
 * judges these numbers, so an impact that is displayed as 0 is never a hidden negative.
 */
export interface Trial {
  /** Every member's day with only this change applied to the baseline. */
  exposure: HouseholdExposure;
  /** kg CO2e saved per day; negative when the change emits more. */
  co2SavedKg: number;
}

/** A recommendation plus what the planner needs to vet it and to apply it. */
export interface ActionProposal {
  item: RoutineItem;
  /** Applied to the optimised day when the item is a selected free action. */
  apply?: ScenarioChange;
  /** The simulation behind `item.impact`. Absent for advice, which changes nothing. */
  trial?: Trial;
}

/** Proposes zero, one or several recommendations (one per member, for exercise). */
export type ActionBuilder = (ctx: PlanContext) => ActionProposal | readonly ActionProposal[] | null;

/** A recommendation's own fields, before who it covers and what it saves are attached. */
export type ItemDraft = Omit<RoutineItem, 'memberIds' | 'impact' | 'freeAction'>;

/** Sets up the shared context for one plan. */
export function createPlanContext(household: Household, air: AirSnapshot): PlanContext {
  const { hourly, nowIndex } = air;
  const sim = new Simulator(hourly, nowIndex, household);
  const { from, to } = sim;
  const baseline = baselineScenario(household, hourly, from, to);
  const baseExposure = sim.household(baseline);
  return {
    household,
    hourly,
    sim,
    baseline,
    baseExposure,
    everyone: household.members.map((m) => m.id),
    clean: cleanestWindow(hourly, from, to, AIRING_WINDOW),
    cleanDaylight: cleanestWindow(hourly, from, to, { dayStart: 7, dayEnd: 18 }),
    lids: lidSpans(hourly, from, to),
    simulate(change) {
      const trial = cloneScenario(baseline);
      change(trial);
      return sim.household(trial);
    },
  };
}

/** Who a free action covers and what it saves beyond the simulated dose. */
export interface FreeActionScope {
  /** Members the action and its impact apply to. Default: the whole household. */
  memberIds?: string[];
  /** kg CO2e saved per day. Default 0. */
  co2SavedKg?: number;
}

/** A free action: its impact is simulated from `apply`, which also feeds the optimised day. */
export function freeAction(
  ctx: PlanContext,
  draft: ItemDraft,
  apply: ScenarioChange,
  scope: FreeActionScope = {},
): ActionProposal {
  const { memberIds = ctx.everyone, co2SavedKg = 0 } = scope;
  const exposure = ctx.simulate(apply);
  const impact = impactBetween(ctx.baseExposure, exposure, memberIds, co2SavedKg);
  const item = { ...draft, memberIds, impact, freeAction: true };
  return { item, apply, trial: { exposure, co2SavedKg } };
}

/** A paid upgrade: reported with its simulated impact but never applied to the free-actions day. */
export function upgrade(
  ctx: PlanContext,
  draft: ItemDraft,
  change: ScenarioChange,
): ActionProposal {
  const exposure = ctx.simulate(change);
  const impact = impactBetween(ctx.baseExposure, exposure, ctx.everyone);
  const item = { ...draft, memberIds: ctx.everyone, impact, freeAction: false };
  return { item, trial: { exposure, co2SavedKg: 0 } };
}

/** Free advice with nothing to simulate, such as keeping a habit that is already fine. */
export function advice(draft: ItemDraft, memberIds: string[]): ActionProposal {
  return { item: { ...draft, memberIds, impact: noImpact(), freeAction: true } };
}
