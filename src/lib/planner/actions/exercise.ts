/**
 * Per-member exercise timing: keep the habit, move it to the cleanest daylight hour, or take it
 * inside. The usual choice is simulated first; when it would leave the member worse off, the
 * next best option that passes the do-no-harm rule is proposed instead, and failing that the
 * habit stays where it is.
 */
import { outdoorEffortLimit, sensitivityOf } from '../../science/exposure.js';
import { fmtHour, type Window as PmWindow } from '../../science/meteo.js';
import type { Member } from '../../profile/schema.js';
import { advice, freeAction, type ActionProposal, type PlanContext } from '../context.js';
import { fmtPm, hourSpan } from '../format.js';
import { firstSafe } from '../guard.js';
import type { ScenarioChange } from '../scenario.js';

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

/** The habit is over the limit, yet nothing the planner can simulate would lower the dose. */
function noBetterSlot(f: ExerciseFacts): ActionProposal {
  return advice(
    {
      id: `exercise-${f.member.id}`,
      kind: 'exercise',
      status: 'caution',
      time: f.usual,
      endTime: null,
      title: `No cleaner slot for ${f.who} ${f.usual} ${f.activity} today`,
      detail: `${f.usual} is forecast at ${fmtPm(f.habitPm)}, over ${f.who} outdoor limit of ${fmtPm(f.limit)}${f.reason}. Neither indoors nor the cleanest daylight hour simulates any better today, so the plan leaves the habit where it is.`,
    },
    [f.member.id],
  );
}

/** How the usual hour compares with the member's limit, as the opening of a move's detail. */
function habitVerdict(f: ExerciseFacts): string {
  const reading = `${f.usual} is forecast at ${fmtPm(f.habitPm)}`;
  const limit = `${f.who} limit of ${fmtPm(f.limit)}${f.reason}`;
  return f.habitPm > f.limit
    ? `${reading}, over ${limit}.`
    : `${reading}, inside ${limit} but well above the cleanest hour.`;
}

/** Move the session outdoors to the cleanest daylight hour, which may still be over the limit. */
function moveExercise(ctx: PlanContext, f: ExerciseFacts, cleanest: PmWindow): ActionProposal {
  const { member: m } = f;
  const withinLimit = cleanest.meanPm25 <= f.limit;
  const caveat = withinLimit ? '' : ', still over that limit but the cleanest outdoor air today';
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
      status: withinLimit ? 'go' : 'caution',
      time: t.start,
      endTime: null,
      title: `Move ${f.who} ${f.activity} from ${f.usual} to ${t.start}`,
      change: {
        before: `${m.name}: ${f.activity} outdoors at ${f.usual} · ${fmtPm(f.habitPm)}`,
        after: `${m.name}: ${f.activity} outdoors at ${t.start} · ${cleanestPm}`,
      },
      detail: `${habitVerdict(f)} ${t.start} is the cleanest daylight hour at ${cleanestPm}${caveat}, and hard breathing multiplies whatever is in the air.`,
    },
    apply,
    { memberIds: [m.id] },
  );
}

/** Why the session goes inside: no daylight hour is clean enough, or the clean one is no gain. */
function indoorReason(ctx: PlanContext, f: ExerciseFacts): string {
  const { cleanDaylight } = ctx;
  const limit = `${f.who} outdoor limit of ${fmtPm(f.limit)}${f.reason}`;
  if (cleanDaylight && cleanDaylight.meanPm25 <= f.limit) {
    return `${f.usual} is forecast at ${fmtPm(f.habitPm)}, over ${limit}, and moving to the cleanest daylight hour simulates no better.`;
  }
  const best = cleanDaylight ? fmtPm(cleanDaylight.meanPm25) : 'no reading';
  return `No daylight hour gets under ${limit}; the best is ${best}.`;
}

/** Take the session inside at the usual hour. */
function indoorExercise(ctx: PlanContext, f: ExerciseFacts): ActionProposal {
  const { member: m } = f;
  const apply: ScenarioChange = (s) => {
    s.exercise[m.id] = 'indoor';
  };
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
      detail: `${indoorReason(ctx, f)} Indoors with windows shut cuts what each deep breath carries.`,
    },
    apply,
    { memberIds: [m.id] },
  );
}

/**
 * The changes worth simulating for one member, most preferred first. With a daylight hour inside
 * their limit that is the move, then indoors if the habit is over the limit. Without one it is
 * indoors, then the cleanest outdoor hour if it at least beats the usual one.
 */
function alternatives(ctx: PlanContext, f: ExerciseFacts): (() => ActionProposal)[] {
  const { cleanDaylight } = ctx;
  const indoors = () => indoorExercise(ctx, f);
  if (!cleanDaylight) return [indoors];
  const move = () => moveExercise(ctx, f, cleanDaylight);
  if (cleanDaylight.meanPm25 <= f.limit) return f.habitPm > f.limit ? [move, indoors] : [move];
  return cleanDaylight.meanPm25 < f.habitPm ? [indoors, move] : [indoors];
}

function exerciseAction(ctx: PlanContext, m: Member): ActionProposal | null {
  if (m.exercise === 'none') return null;
  const habitIdx = ctx.baseline.exercise[m.id];
  if (typeof habitIdx !== 'number') return null;

  const f = exerciseFacts(ctx, m, habitIdx);
  const { cleanDaylight } = ctx;
  const withinLimit = f.habitPm <= f.limit;
  const nearCleanest = !cleanDaylight || f.habitPm <= cleanDaylight.meanPm25 * CLOSE_TO_CLEANEST;
  if (withinLimit && nearCleanest) return keepExercise(f);
  // A cooking hour can make indoors dirtier than the street, and a move can strand someone in
  // a smoky room at the old hour: only a change that simulates as harmless is proposed.
  const better = firstSafe(ctx, alternatives(ctx, f), (simulate) => simulate());
  if (better) return better;
  return withinLimit ? keepExercise(f) : noBetterSlot(f);
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
