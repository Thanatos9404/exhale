import { outdoorEffortLimit, sensitivityOf } from '../../science/exposure.js';
import { fmtHour, type Window as PmWindow } from '../../science/meteo.js';
import type { Member } from '../../profile/schema.js';
import { advice, freeAction, type ActionProposal, type PlanContext } from '../context.js';
import { fmtPm, hourSpan } from '../format.js';
import type { ScenarioChange } from '../scenario.js';

/** Per-member exercise timing: keep it, move it to a cleaner daylight hour, or take it inside. */

/** A habit counts as already clean if it is within 20% of the cleanest daylight hour. */
const CLOSE_TO_CLEANEST = 1.2;

const EXERCISE_LABEL: Record<Member['exercise'], string> = {
  none: 'exercise',
  walk: 'walk',
  yoga: 'yoga',
  cycle: 'cycle ride',
  run: 'run',
};

/** The numbers and wording every exercise recommendation for one member shares. */
interface ExerciseFacts {
  member: Member;
  /** Outdoor PM2.5 at the usual hour, µg/m³. */
  habitPm: number;
  /** The member's outdoor-effort ceiling, µg/m³. */
  limit: number;
  /** "walk", "cycle ride" and so on. */
  activity: string;
  /** Usual start, "HH:00". */
  usual: string;
  /** "your" for the profile owner, otherwise "Name's". */
  who: string;
  /** Why the limit is lower than a healthy adult's, e.g. " (asthma)", or empty. */
  reason: string;
}

function sensitivityReason(m: Member): string {
  if (m.conditions.length > 0) return ` (${m.conditions.join(', ')})`;
  if (m.ageGroup !== 'adult') return ` (${m.ageGroup})`;
  return '';
}

function exerciseFacts(ctx: PlanContext, m: Member, habitIdx: number): ExerciseFacts {
  return {
    member: m,
    habitPm: ctx.sim.ambient(habitIdx),
    limit: outdoorEffortLimit(sensitivityOf(m.ageGroup, m.conditions)),
    activity: EXERCISE_LABEL[m.exercise],
    usual: fmtHour(m.exerciseHour),
    who: m.id === 'you' ? 'your' : `${m.name}'s`,
    reason: sensitivityReason(m),
  };
}

function keepExercise(f: ExerciseFacts): ActionProposal {
  return advice(
    {
      id: `exercise-${f.member.id}`,
      kind: 'exercise',
      status: 'go',
      time: f.usual,
      endTime: null,
      title: `Keep ${f.who} ${f.usual} ${f.activity}`,
      detail: `${fmtPm(f.habitPm)} at ${f.usual} is within ${f.who} outdoor limit of ${fmtPm(f.limit)}${f.reason}.`,
    },
    [f.member.id],
  );
}

function moveExercise(ctx: PlanContext, f: ExerciseFacts, cleanest: PmWindow): ActionProposal {
  const { member: m } = f;
  const apply: ScenarioChange = (s) => {
    s.exercise[m.id] = cleanest.start;
  };
  const t = hourSpan(ctx.hourly, cleanest.start, cleanest.end);
  const cleanestPm = fmtPm(cleanest.meanPm25);
  return freeAction(
    ctx,
    {
      id: `exercise-${m.id}`,
      kind: 'exercise',
      status: 'go',
      time: t.start,
      endTime: null,
      title: `Move ${f.who} ${f.activity} from ${f.usual} to ${t.start}`,
      change: {
        before: `${m.name}: ${f.activity} outdoors at ${f.usual} · ${fmtPm(f.habitPm)}`,
        after: `${m.name}: ${f.activity} outdoors at ${t.start} · ${cleanestPm}`,
      },
      detail: `${f.usual} is forecast at ${fmtPm(f.habitPm)}, over ${f.who} limit of ${fmtPm(f.limit)}${f.reason}. ${t.start} is the cleanest daylight hour at ${cleanestPm}, and hard breathing multiplies whatever is in the air.`,
    },
    apply,
    [m.id],
  );
}

function indoorExercise(ctx: PlanContext, f: ExerciseFacts): ActionProposal {
  const { member: m } = f;
  const apply: ScenarioChange = (s) => {
    s.exercise[m.id] = 'indoor';
  };
  const best = ctx.cleanDaylight ? fmtPm(ctx.cleanDaylight.meanPm25) : 'no reading';
  return freeAction(
    ctx,
    {
      id: `exercise-${m.id}`,
      kind: 'exercise',
      status: 'avoid',
      time: f.usual,
      endTime: null,
      title: `Take ${f.who} ${f.activity} indoors today`,
      change: {
        before: `${m.name}: ${f.activity} outdoors at ${f.usual} · ${fmtPm(f.habitPm)}`,
        after: `${m.name}: ${f.activity} indoors, windows shut`,
      },
      detail: `No daylight hour gets under ${f.who} outdoor limit of ${fmtPm(f.limit)}${f.reason}; the best is ${best}. Indoors with windows shut cuts what each deep breath carries.`,
    },
    apply,
    [m.id],
  );
}

function exerciseAction(ctx: PlanContext, m: Member): ActionProposal | null {
  if (m.exercise === 'none') return null;
  const habitIdx = ctx.baseline.exercise[m.id];
  if (typeof habitIdx !== 'number') return null;

  const f = exerciseFacts(ctx, m, habitIdx);
  const { cleanDaylight } = ctx;
  const nearCleanest = !cleanDaylight || f.habitPm <= cleanDaylight.meanPm25 * CLOSE_TO_CLEANEST;
  if (f.habitPm <= f.limit && nearCleanest) return keepExercise(f);
  if (cleanDaylight && cleanDaylight.meanPm25 <= f.limit) {
    return moveExercise(ctx, f, cleanDaylight);
  }
  return indoorExercise(ctx, f);
}

/** One exercise recommendation per member who exercises within the horizon. */
export function exerciseActions(ctx: PlanContext): ActionProposal[] {
  const proposals: ActionProposal[] = [];
  for (const m of ctx.household.members) {
    const proposal = exerciseAction(ctx, m);
    if (proposal) proposals.push(proposal);
  }
  return proposals;
}
