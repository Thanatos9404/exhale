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
import type { Impact, RoutineItem } from './types.js';

/**
 * What every recommendation builder needs: the household, the forecast, the baseline day and
 * the meteorology the advice is anchored to. Built once per plan.
 */
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
  /** Simulates `change` on its own against the baseline and reports what it saves `memberIds`. */
  impactOf(change: ScenarioChange, memberIds: readonly string[], co2SavedKg?: number): Impact;
}

/** A recommendation plus, for free actions, the change it makes to the optimised day. */
export interface ActionProposal {
  item: RoutineItem;
  /** Applied to the optimised day when the item is a selected free action. */
  apply?: ScenarioChange;
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
    clean: cleanestWindow(hourly, from, to, 1, 9, 17),
    cleanDaylight: cleanestWindow(hourly, from, to, 1, 7, 18),
    lids: lidSpans(hourly, from, to),
    impactOf(change, memberIds, co2SavedKg = 0) {
      const trial = cloneScenario(baseline);
      change(trial);
      return impactBetween(baseExposure, sim.household(trial), memberIds, co2SavedKg);
    },
  };
}

/** A free action: its impact is simulated from `apply`, which also feeds the optimised day. */
export function freeAction(
  ctx: PlanContext,
  draft: ItemDraft,
  apply: ScenarioChange,
  memberIds: string[] = ctx.everyone,
  co2SavedKg = 0,
): ActionProposal {
  const impact = ctx.impactOf(apply, memberIds, co2SavedKg);
  return { item: { ...draft, memberIds, impact, freeAction: true }, apply };
}

/** A paid upgrade: reported with its simulated impact but never applied to the free-actions day. */
export function upgrade(
  ctx: PlanContext,
  draft: ItemDraft,
  change: ScenarioChange,
): ActionProposal {
  const impact = ctx.impactOf(change, ctx.everyone);
  return { item: { ...draft, memberIds: ctx.everyone, impact, freeAction: false } };
}

/** Free advice with nothing to simulate, such as keeping a habit that is already fine. */
export function advice(draft: ItemDraft, memberIds: string[]): ActionProposal {
  return { item: { ...draft, memberIds, impact: noImpact(), freeAction: true } };
}
