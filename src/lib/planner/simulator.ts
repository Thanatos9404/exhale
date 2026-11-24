/**
 * Hour-by-hour exposure simulation. For every member and every hour of the horizon it works
 * out where they are (home, work, school, in transit, exercising), the PM2.5 there, and how
 * hard they breathe, then sums the inhaled dose.
 */
import type { HourPoint } from '../air/types.js';
import { BREATHING_RATE, type Activity } from '../science/exposure.js';
import { SOURCE_RATE, simulateRoom, sourceIncrement } from '../science/indoor.js';
import type { Household, Member } from '../profile/schema.js';
import { hourAt } from './format.js';
import {
  awayFactorAt,
  exerciseVenueAt,
  isSleepHour,
  planMemberDay,
  type MemberDay,
} from './memberDay.js';
import type { Scenario } from './scenario.js';

/** How far ahead a plan looks, in hours. */
export const HORIZON_HOURS = 24;

/** Roadside air while exercising outdoors, relative to the city-wide reading. */
export const OUTDOOR_FACTOR = 1.1;

/** Local hours when each indoor source is active. */
const COOKING_HOURS = [8, 13, 20];
const COIL_HOURS = [22, 23, 0, 1, 2, 3, 4, 5];
const INCENSE_HOURS = [19];
const SMOKING_HOURS = [10, 15, 21];
const HEATING_HOURS = [19, 20, 21, 22];

/** What one member breathes over the horizon. */
export interface Exposure {
  /** Inhaled PM2.5 mass, µg. */
  doseUg: number;
  /** Concentration × time, µg/m³ × h; the basis of the cigarette equivalence. */
  concHours: number;
  /** Volume of air breathed, m³. */
  breathedM3: number;
}

/** Exposure per member id, in household order. */
export type HouseholdExposure = ReadonlyMap<string, Exposure>;

/** Indoor emissions at local hour `hod` under a scenario, µg/h. */
export function indoorSourceRate(hod: number, s: Scenario): number {
  let source = 0;
  if (COOKING_HOURS.includes(hod)) source += s.cookingRate * (1 - s.cookingCapture);
  if (s.coil && COIL_HOURS.includes(hod)) source += SOURCE_RATE.mosquitoCoil;
  if (s.incense && INCENSE_HOURS.includes(hod)) source += SOURCE_RATE.incense;
  if (s.smoking && SMOKING_HOURS.includes(hod)) source += SOURCE_RATE.cigarette;
  if (HEATING_HOURS.includes(hod)) source += s.heatingRate;
  return source;
}

/** Running totals of what one member breathes. */
class DoseTally {
  private doseUg = 0;
  private concHours = 0;
  private breathedM3 = 0;

  constructor(private readonly rates: Readonly<Record<Activity, number>>) {}

  /** Adds `hours` spent in air at `conc` µg/m³ while doing `activity`. */
  add(conc: number, activity: Activity, hours: number): void {
    if (hours <= 0) return;
    const rate = this.rates[activity];
    this.doseUg += conc * rate * hours;
    this.concHours += conc * hours;
    this.breathedM3 += rate * hours;
  }

  total(): Exposure {
    return { doseUg: this.doseUg, concHours: this.concHours, breathedM3: this.breathedM3 };
  }
}

/** Plays one member's day under one scenario. */
class MemberRun {
  private readonly day: MemberDay;
  private readonly tally: DoseTally;

  constructor(
    private readonly sim: Simulator,
    member: Member,
    private readonly scenario: Scenario,
  ) {
    this.day = planMemberDay(sim.hh, member, scenario);
    this.tally = new DoseTally(BREATHING_RATE[member.ageGroup]);
  }

  run(): Exposure {
    for (let i = this.sim.from; i < this.sim.to; i++) this.hour(i);
    return this.tally.total();
  }

  /** Splits hour `i` between travel, exercise and wherever the member spends the rest of it. */
  private hour(i: number): void {
    const hod = hourAt(this.sim.hourly, i);
    const ambient = this.sim.ambient(i);
    let remaining = 1;
    remaining -= this.commuteLeg(hod, ambient);
    remaining -= this.exercise(i, hod, ambient, remaining);
    if (remaining <= 0) return;
    const away = awayFactorAt(this.day, hod);
    if (away !== null) {
      this.tally.add(ambient * away, 'rest', remaining);
      return;
    }
    const activity = isSleepHour(hod) ? 'sleep' : 'rest';
    this.tally.add(this.sim.homeConc(i, this.scenario), activity, remaining);
  }

  /** Breathes the commute leg that runs this hour, if any. Returns the hours it took. */
  private commuteLeg(hod: number, ambient: number): number {
    const trip = this.day.commute;
    if (!trip || (hod !== trip.depart && hod !== trip.ret)) return 0;
    this.tally.add(ambient * trip.transitFactor, trip.activity, trip.legHours);
    return trip.legHours;
  }

  /** Breathes this hour's exercise session, if any. Returns the hours it took. */
  private exercise(i: number, hod: number, ambient: number, remaining: number): number {
    const plan = this.day.exercise;
    const venue = exerciseVenueAt(plan, i, hod);
    if (!plan || venue === null) return 0;
    const conc =
      venue === 'outdoor' ? ambient * OUTDOOR_FACTOR : this.sim.homeConc(i, this.scenario);
    const hours = Math.min(remaining, plan.hours);
    this.tally.add(conc, plan.activity, hours);
    return hours;
  }
}

/** The commute fields of a scenario, blanked for members who do not make the commute. */
const NO_COMMUTE = { commuteMode: 'wfh', n95: false, departShift: 0 } as const;

/**
 * Everything in a scenario that can change one member's day, as a cache key: the whole scenario
 * minus the other members' exercise and, for anyone but the commuter, minus the commute.
 */
function dayKey(hh: Household, m: Member, s: Scenario): string {
  const commute = hh.commute.memberId === m.id ? {} : NO_COMMUTE;
  return JSON.stringify({ ...s, ...commute, exercise: s.exercise[m.id] ?? null });
}

/** Simulates the household over `HORIZON_HOURS` from the current hour of an hourly forecast. */
export class Simulator {
  /** Days already played, per member. Vetting a plan replays many near-identical days. */
  private readonly played = new WeakMap<Member, Map<string, Exposure>>();

  /** First simulated index into `hourly` (the current hour). */
  readonly from: number;
  /** One past the last simulated index. */
  readonly to: number;

  constructor(
    readonly hourly: readonly HourPoint[],
    nowIndex: number,
    readonly hh: Household,
  ) {
    this.from = nowIndex;
    this.to = Math.min(hourly.length, nowIndex + HORIZON_HOURS);
  }

  /** Outdoor PM2.5 at hourly index `i`, µg/m³. Missing readings count as clean air. */
  ambient(i: number): number {
    return Math.max(0, this.hourly[i]?.pm25 ?? 0);
  }

  /** Indoor PM2.5 at home at hourly index `i` under a scenario, µg/m³. */
  homeConc(i: number, s: Scenario): number {
    const { home } = this.hh;
    const room = simulateRoom({
      outdoorPm25: this.ambient(i),
      areaM2: home.areaM2,
      ventilation: home.ventilation,
      windowsOpen: s.airingIdx === i,
      purifier: s.purifier,
    });
    const source = indoorSourceRate(hourAt(this.hourly, i), s);
    const add = source > 0 ? sourceIncrement(source, home.ventilation, s.purifier, home.areaM2) : 0;
    return room.indoorPm25 + add;
  }

  /**
   * One member's exposure over the horizon. Remembered per member and scenario, so the household
   * and forecast must not be changed after the simulator is built.
   */
  memberExposure(m: Member, s: Scenario): Exposure {
    const days = this.played.get(m) ?? new Map<string, Exposure>();
    this.played.set(m, days);
    const key = dayKey(this.hh, m, s);
    const known = days.get(key);
    if (known) return known;
    const exposure = new MemberRun(this, m, s).run();
    days.set(key, exposure);
    return exposure;
  }

  /** Every member's exposure over the horizon. */
  household(s: Scenario): Map<string, Exposure> {
    return new Map(this.hh.members.map((m) => [m.id, this.memberExposure(m, s)]));
  }
}
