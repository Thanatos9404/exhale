import { MODES, N95_FACTOR, tripExposure } from '../science/commute.js';
import type { Activity } from '../science/exposure.js';
import type { Household, Member } from '../profile/schema.js';
import type { Scenario } from './scenario.js';

/**
 * Where one member is during the day and how hard they breathe, derived once per scenario so
 * the hour-by-hour simulation only has to look things up.
 */

/** Assumed indoor/outdoor PM2.5 ratio while at an office. */
export const OFFICE_FACTOR = 0.55;

/** Assumed indoor/outdoor PM2.5 ratio while at school. */
export const SCHOOL_FACTOR = 0.85;

/** Office hours for members who work away from home but do not commute in the plan. */
const OFFICE_HOURS: HourRange = { start: 9, end: 18 };

/** School hours, local time. */
const SCHOOL_HOURS: HourRange = { start: 8, end: 14 };

/** Breathing-rate activity level for each kind of exercise (see BREATHING_RATE). */
const ACTIVITY_FOR: Record<Member['exercise'], Activity> = {
  none: 'rest',
  walk: 'light',
  yoga: 'light',
  cycle: 'moderate',
  run: 'vigorous',
};

/** Local hours [start, end); end may be earlier than start for a range past midnight. */
export interface HourRange {
  start: number;
  end: number;
}

/** The commuter's two trips under a scenario. */
export interface CommutePattern {
  /** Local hour of the outbound leg, after any what-if shift. */
  depart: number;
  /** Local hour of the return leg, after any what-if shift. */
  ret: number;
  /** Hours each leg takes out of its hour, at most one. */
  legHours: number;
  /** In-transit PM2.5 relative to the ambient reading, after any mask. */
  transitFactor: number;
  activity: Activity;
}

/** A member's exercise session under a scenario. */
export interface ExercisePlan {
  /** Hourly index of an outdoor session, or 'indoor' for one at the usual hour inside. */
  slot: number | 'indoor';
  /** Usual local hour, used for indoor sessions. */
  hourOfDay: number;
  /** Session length in hours, at most one. */
  hours: number;
  activity: Activity;
}

/** Everything about a member's day that does not change hour to hour. */
export interface MemberDay {
  commute: CommutePattern | null;
  /** Hours at work: the commute window for the commuter, office hours otherwise, null at home. */
  work: HourRange | null;
  /** Spends the school day away from home (only when not already at work). */
  school: boolean;
  exercise: ExercisePlan | null;
}

/** True when the local hour `hod` falls inside `range`, wrapping past midnight. */
export function isWithinHours(hod: number, range: HourRange): boolean {
  const { start, end } = range;
  return start <= end ? hod >= start && hod < end : hod >= start || hod < end;
}

/** Night hours, 23:00 to 07:00, when people at home breathe at their sleeping rate. */
export function isSleepHour(hod: number): boolean {
  return isWithinHours(hod, { start: 23, end: 7 });
}

function commutePattern(household: Household, m: Member, s: Scenario): CommutePattern | null {
  const { commute } = household;
  const mode = s.commuteMode;
  const travels = commute.distanceKm > 0;
  if (commute.memberId !== m.id || mode === 'wfh' || !travels) return null;
  // Only the trip duration matters here; the ambient level is applied hour by hour.
  const trip = tripExposure({
    mode,
    distanceKm: commute.distanceKm,
    ambientPm25: 1,
    ageGroup: m.ageGroup,
    n95: s.n95,
  });
  const spec = MODES[mode];
  return {
    depart: (commute.departHour + s.departShift + 24) % 24,
    ret: (commute.returnHour + s.departShift + 24) % 24,
    legHours: Math.min(1, trip.minutes / 60),
    transitFactor: spec.exposureFactor * (s.n95 && spec.open ? N95_FACTOR : 1),
    activity: spec.activity,
  };
}

function workHours(m: Member, commute: CommutePattern | null): HourRange | null {
  if (commute) return { start: commute.depart, end: commute.ret };
  return m.daytime === 'office' ? OFFICE_HOURS : null;
}

function exercisePlan(m: Member, s: Scenario): ExercisePlan | null {
  const slot = s.exercise[m.id] ?? null;
  if (slot === null || m.exercise === 'none') return null;
  return {
    slot,
    hourOfDay: m.exerciseHour,
    hours: Math.min(1, m.exerciseMinutes / 60),
    activity: ACTIVITY_FOR[m.exercise],
  };
}

/** Derives a member's fixed daily pattern under a scenario. */
export function planMemberDay(household: Household, m: Member, s: Scenario): MemberDay {
  const commute = commutePattern(household, m, s);
  const work = workHours(m, commute);
  return {
    commute,
    work,
    school: work === null && m.daytime === 'school',
    exercise: exercisePlan(m, s),
  };
}

/** Indoor/outdoor ratio where the member is at local hour `hod`, or null when they are home. */
export function awayFactorAt(day: MemberDay, hod: number): number | null {
  if (day.work) return isWithinHours(hod, day.work) ? OFFICE_FACTOR : null;
  if (day.school && isWithinHours(hod, SCHOOL_HOURS)) return SCHOOL_FACTOR;
  return null;
}

/** Where this hour's exercise happens, or null if there is none at hourly index `i`. */
export function exerciseVenueAt(
  plan: ExercisePlan | null,
  i: number,
  hod: number,
): 'outdoor' | 'indoor' | null {
  if (!plan) return null;
  if (typeof plan.slot === 'number') return plan.slot === i ? 'outdoor' : null;
  return hod === plan.hourOfDay ? 'indoor' : null;
}
