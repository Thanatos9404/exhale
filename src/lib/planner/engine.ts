import { aqiCategory, aqiSeries, type AqiLevel } from '../air/aqi.js';
import type { AirSnapshot, HourPoint, Pollutant } from '../air/types.js';
import { MODES, MODE_LABEL, N95_FACTOR, rankModes, tripExposure, type CommuteMode } from '../science/commute.js';
import {
  BREATHING_RATE,
  WHO_PM25_24H,
  cigarettesFromConcHours,
  outdoorEffortLimit,
  sensitivityOf,
  type Activity,
} from '../science/exposure.js';
import {
  EXHAUST_CAPTURE,
  SOURCE_RATE,
  simulateRoom,
  sourceIncrement,
  type Purifier,
} from '../science/indoor.js';
import {
  cleanestWindow,
  dirtiestWindow,
  dispersionClass,
  fmtHour,
  hourOf,
  lidSpans,
  ventilationCoefficient,
  type Dispersion,
} from '../science/meteo.js';
import type { Household, Member } from '../profile/schema.js';

/**
 * The decision engine. Given live air data and a household profile it:
 *  1. simulates every member's next 24 hours, hour by hour (where they are, how hard they breathe),
 *  2. tests each candidate change on its own against that baseline,
 *  3. keeps the changes that help and reports their exact impact.
 * Every number the UI or the AI shows comes from here, so explanations stay grounded and testable.
 */

export const HORIZON_HOURS = 24;

export type RoutineKind = 'ventilate' | 'exercise' | 'commute' | 'protect' | 'home' | 'upgrade';
export type RoutineStatus = 'go' | 'caution' | 'avoid';

export interface Impact {
  /** µg of PM2.5 not inhaled today, summed over affected members. */
  doseSavedUg: number;
  /** Share of the affected members' daily dose removed, 0 to 100. */
  exposureCutPct: number;
  cigarettesAvoided: number;
  /** kg CO2e saved per day. */
  co2SavedKg: number;
}

export interface RoutineItem {
  id: string;
  kind: RoutineKind;
  status: RoutineStatus;
  /** Local "HH:00" start, if the action is time-bound. */
  time: string | null;
  endTime: string | null;
  title: string;
  detail: string;
  memberIds: string[];
  impact: Impact;
  /** Upgrades cost money or effort and are kept out of the free-actions total. */
  freeAction: boolean;
  /** The habit and its replacement, for diff views. */
  change?: { before: string; after: string };
}

export interface MemberSummary {
  id: string;
  name: string;
  sensitivity: number;
  /** Highest outdoor PM2.5 for scheduled exercise, µg/m³. */
  pm25Limit: number;
  /** Dose they would inhale breathing WHO-guideline air on the same schedule, µg. */
  budgetUg: number;
  baselineDoseUg: number;
  optimizedDoseUg: number;
  baselineCigarettes: number;
  optimizedCigarettes: number;
}

export interface PlanResult {
  placeLabel: string;
  generatedAt: string;
  horizon: { start: string; end: string };
  risk: { aqi: number; level: AqiLevel; label: string; advice: string; dominant: Pollutant; standard: Household['standard'] };
  current: { pm25: number | null; blh: number | null; wind: number | null; ventilationCoefficient: number | null; dispersion: Dispersion | null };
  lid: { spans: { start: string; end: string; minBlh: number }[]; stagnantHours: number };
  cleanWindow: { start: string; end: string; pm25: number } | null;
  worstWindow: { start: string; end: string; pm25: number } | null;
  headline: string;
  items: RoutineItem[];
  members: MemberSummary[];
  totals: {
    baselineDoseUg: number;
    optimizedDoseUg: number;
    exposureCutPct: number;
    cigarettesAvoided: number;
    co2SavedKgDay: number;
    co2SavedKgWeek: number;
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Scenario simulation                                                                         */
/* ------------------------------------------------------------------------------------------ */

interface Scenario {
  /** Hourly index of each member's exercise, 'indoor' to move it inside, or null for none. */
  exercise: Record<string, number | 'indoor' | null>;
  airingIdx: number | null;
  commuteMode: CommuteMode;
  n95: boolean;
  departShift: number;
  purifier: Purifier;
  coil: boolean;
  incense: boolean;
  smoking: boolean;
  /** Fraction of cooking emissions removed at source. */
  cookingCapture: number;
  cookingRate: number;
  heatingRate: number;
}

interface Exposure {
  doseUg: number;
  concHours: number;
  breathedM3: number;
}

const ACTIVITY_FOR: Record<Member['exercise'], Activity> = {
  none: 'rest',
  walk: 'light',
  yoga: 'light',
  cycle: 'moderate',
  run: 'vigorous',
};

const EXERCISE_LABEL: Record<Member['exercise'], string> = {
  none: 'exercise',
  walk: 'walk',
  yoga: 'yoga',
  cycle: 'cycle ride',
  run: 'run',
};

const OUTDOOR_FACTOR = 1.1;
const OFFICE_FACTOR = 0.55;
const SCHOOL_FACTOR = 0.85;
const COOKING_HOURS = [8, 13, 20];
const COIL_HOURS = [22, 23, 0, 1, 2, 3, 4, 5];
const INCENSE_HOURS = [19];
const SMOKING_HOURS = [10, 15, 21];
const HEATING_HOURS = [19, 20, 21, 22];

const isSleep = (hod: number) => hod >= 23 || hod < 7;

function nextIndexOfHour(hourly: readonly HourPoint[], from: number, to: number, hod: number): number | null {
  for (let i = from; i < Math.min(to, hourly.length); i++) if (hourOf(hourly[i]!.time) === hod) return i;
  return null;
}

class Simulator {
  readonly from: number;
  readonly to: number;

  constructor(
    readonly hourly: readonly HourPoint[],
    nowIndex: number,
    readonly hh: Household,
  ) {
    this.from = nowIndex;
    this.to = Math.min(hourly.length, nowIndex + HORIZON_HOURS);
  }

  ambient(i: number): number {
    return Math.max(0, this.hourly[i]?.pm25 ?? 0);
  }

  homeConc(i: number, s: Scenario): number {
    const { home } = this.hh;
    const hod = hourOf(this.hourly[i]!.time);
    const outdoor = this.ambient(i);
    const room = simulateRoom({
      outdoorPm25: outdoor,
      areaM2: home.areaM2,
      ventilation: home.ventilation,
      windowsOpen: s.airingIdx === i,
      purifier: s.purifier,
    });
    let source = 0;
    if (COOKING_HOURS.includes(hod)) source += s.cookingRate * (1 - s.cookingCapture);
    if (s.coil && COIL_HOURS.includes(hod)) source += SOURCE_RATE.mosquitoCoil;
    if (s.incense && INCENSE_HOURS.includes(hod)) source += SOURCE_RATE.incense;
    if (s.smoking && SMOKING_HOURS.includes(hod)) source += SOURCE_RATE.cigarette;
    if (HEATING_HOURS.includes(hod)) source += s.heatingRate;
    const add = source > 0 ? sourceIncrement(source, home.ventilation, s.purifier, home.areaM2) : 0;
    return room.indoorPm25 + add;
  }

  memberExposure(m: Member, s: Scenario): Exposure {
    const rates = BREATHING_RATE[m.ageGroup];
    const commute = this.hh.commute;
    const isCommuter = commute.memberId === m.id && s.commuteMode !== 'wfh' && commute.distanceKm > 0;
    const trip = isCommuter
      ? tripExposure({
          mode: s.commuteMode as Exclude<CommuteMode, 'wfh'>,
          distanceKm: commute.distanceKm,
          ambientPm25: 1,
          ageGroup: m.ageGroup,
          n95: s.n95,
        })
      : null;
    const tripHours = trip ? trip.minutes / 60 : 0;
    const spec = isCommuter ? MODES[s.commuteMode as Exclude<CommuteMode, 'wfh'>] : null;
    const transitFactor = spec ? spec.exposureFactor * (s.n95 && spec.open ? N95_FACTOR : 1) : 0;
    const depart = (commute.departHour + s.departShift + 24) % 24;
    const ret = (commute.returnHour + s.departShift + 24) % 24;
    const exercise = s.exercise[m.id] ?? null;
    const exHours = Math.min(1, m.exerciseMinutes / 60);

    let doseUg = 0;
    let concHours = 0;
    let breathedM3 = 0;
    const add = (conc: number, activity: Activity, hours: number) => {
      if (hours <= 0) return;
      const rate = rates[activity];
      doseUg += conc * rate * hours;
      concHours += conc * hours;
      breathedM3 += rate * hours;
    };

    for (let i = this.from; i < this.to; i++) {
      const hod = hourOf(this.hourly[i]!.time);
      const amb = this.ambient(i);
      let remaining = 1;

      // Away during the day?
      let awayFactor: number | null = null;
      if (isCommuter || m.daytime === 'office') {
        const start = isCommuter ? depart : 9;
        const end = isCommuter ? ret : 18;
        const atWork = start <= end ? hod >= start && hod < end : hod >= start || hod < end;
        if (atWork) awayFactor = OFFICE_FACTOR;
      } else if (m.daytime === 'school' && hod >= 8 && hod < 14) {
        awayFactor = SCHOOL_FACTOR;
      }

      // Commute legs at the departure and return hours.
      if (isCommuter && (hod === depart || hod === ret)) {
        const leg = Math.min(1, tripHours);
        add(amb * transitFactor, spec!.activity, leg);
        remaining -= leg;
      }

      // Exercise.
      if (exercise !== null && m.exercise !== 'none') {
        const isOutdoorSlot = typeof exercise === 'number' && exercise === i;
        const isIndoorSlot = exercise === 'indoor' && hod === m.exerciseHour;
        if (isOutdoorSlot || isIndoorSlot) {
          const conc = isOutdoorSlot ? amb * OUTDOOR_FACTOR : this.homeConc(i, s);
          const h = Math.min(remaining, exHours);
          add(conc, ACTIVITY_FOR[m.exercise], h);
          remaining -= h;
        }
      }

      if (remaining <= 0) continue;
      if (awayFactor !== null) add(amb * awayFactor, 'rest', remaining);
      else add(this.homeConc(i, s), isSleep(hod) ? 'sleep' : 'rest', remaining);
    }
    return { doseUg, concHours, breathedM3 };
  }

  household(s: Scenario): Map<string, Exposure> {
    return new Map(this.hh.members.map((m) => [m.id, this.memberExposure(m, s)]));
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Planning                                                                                    */
/* ------------------------------------------------------------------------------------------ */

const round = (v: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

function impactBetween(
  base: Map<string, Exposure>,
  next: Map<string, Exposure>,
  memberIds: readonly string[],
  co2SavedKg = 0,
): Impact {
  let saved = 0;
  let baseTotal = 0;
  let concSaved = 0;
  for (const id of memberIds) {
    const b = base.get(id);
    const n = next.get(id);
    if (!b || !n) continue;
    saved += b.doseUg - n.doseUg;
    baseTotal += b.doseUg;
    concSaved += b.concHours - n.concHours;
  }
  return {
    doseSavedUg: round(saved),
    exposureCutPct: baseTotal > 0 ? round((saved / baseTotal) * 100, 1) : 0,
    cigarettesAvoided: round(cigarettesFromConcHours(Math.max(0, concSaved)) * Math.sign(concSaved), 2),
    co2SavedKg: round(co2SavedKg, 2),
  };
}

const span = (hourly: readonly HourPoint[], start: number, end: number) => ({
  start: fmtHour(hourOf(hourly[start]!.time)),
  end: fmtHour(hourOf(hourly[Math.max(start, end - 1)]!.time) + 1),
});

const cookingRateFor = (cooking: Household['home']['cooking']) =>
  cooking === 'biomass' ? SOURCE_RATE.biomassStove : cooking === 'lpg' ? SOURCE_RATE.fryingGas : SOURCE_RATE.fryingGas * 0.7;

const heatingRateFor = (heating: Household['home']['heating']) =>
  heating === 'wood' || heating === 'coal' ? 60_000 : heating === 'gas' ? 2_000 : 0;

const fmtPm = (v: number) => `${Math.round(v)} µg/m³`;

export interface PlanOptions {
  /** Apply only these free actions to the optimised day (what-if analysis). Default: all. */
  only?: ReadonlySet<string>;
}

export function buildPlan(household: Household, air: AirSnapshot, now: Date = new Date(), options: PlanOptions = {}): PlanResult {
  const { hourly, nowIndex } = air;
  const sim = new Simulator(hourly, nowIndex, household);
  const { from, to } = sim;
  const { home, commute } = household;
  const members = household.members;

  const habitExercise: Scenario['exercise'] = {};
  for (const m of members) {
    habitExercise[m.id] = m.exercise === 'none' ? null : nextIndexOfHour(hourly, from, to, m.exerciseHour);
  }

  const baseline: Scenario = {
    exercise: habitExercise,
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
  const baseExp = sim.household(baseline);
  const everyone = members.map((m) => m.id);

  const items: RoutineItem[] = [];
  const optimized: Scenario = { ...baseline, exercise: { ...baseline.exercise } };
  const accept = (item: RoutineItem, apply: (s: Scenario) => void) => {
    items.push(item);
    if (item.freeAction && (!options.only || options.only.has(item.id))) apply(optimized);
  };
  const tryChange = (apply: (s: Scenario) => void) => {
    const s: Scenario = { ...baseline, exercise: { ...baseline.exercise } };
    apply(s);
    return sim.household(s);
  };

  // --- Meteorology ----------------------------------------------------------------------
  const clean = cleanestWindow(hourly, from, to, 1, 9, 17);
  const cleanDaylight = cleanestWindow(hourly, from, to, 1, 7, 18);
  const worst = dirtiestWindow(hourly, from, to, 3);
  const lids = lidSpans(hourly, from, to);
  const nowHour = hourly[nowIndex];
  const vcNow = ventilationCoefficient(nowHour?.blh ?? null, nowHour?.wind ?? null);

  // --- 1. Smog lid: shut the house -------------------------------------------------------
  if (lids.length > 0) {
    const longest = lids.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const t = span(hourly, longest.start, longest.end);
    items.push({
      id: 'lid',
      kind: 'protect',
      status: 'avoid',
      time: t.start,
      endTime: t.end,
      title: `Keep windows shut ${t.start} to ${t.end}`,
      change: { before: 'Windows opened as usual', after: `Windows shut ${t.start} to ${t.end}` },
      detail: `A smog lid sits as low as ${Math.round(longest.minBlh)} m with light wind, so street emissions pile up near the ground instead of mixing away. Indoor air is cleaner than outdoor air during these hours only while windows stay closed.`,
      memberIds: everyone,
      impact: { doseSavedUg: 0, exposureCutPct: 0, cigarettesAvoided: 0, co2SavedKg: 0 },
      freeAction: true,
    });
  }

  // --- 2. Airing the house at the cleanest hour ---------------------------------------------
  if (clean && baseline.airingIdx !== null && clean.start !== baseline.airingIdx) {
    const habitPm = sim.ambient(baseline.airingIdx);
    if (clean.meanPm25 < habitPm * 0.9) {
      const next = tryChange((s) => (s.airingIdx = clean.start));
      const t = span(hourly, clean.start, clean.end);
      accept(
        {
          id: 'ventilate',
          kind: 'ventilate',
          status: 'go',
          time: t.start,
          endTime: t.end,
          title: `Air out the house ${t.start} to ${t.end}, not at ${fmtHour(home.airingHour)}`,
          change: { before: `Air out at ${fmtHour(home.airingHour)} · ${fmtPm(habitPm)} outside`, after: `Air out ${t.start} to ${t.end} · ${fmtPm(clean.meanPm25)} outside` },
          detail: `Outdoor PM2.5 is forecast at ${fmtPm(habitPm)} at ${fmtHour(home.airingHour)} but ${fmtPm(clean.meanPm25)} at ${t.start}, when the afternoon sun lifts the mixing layer. Same fresh air, far fewer particles.`,
          memberIds: everyone,
          impact: impactBetween(baseExp, next, everyone),
          freeAction: true,
        },
        (s) => (s.airingIdx = clean.start),
      );
    }
  }

  // --- 3. Exercise per member ---------------------------------------------------------------
  for (const m of members) {
    if (m.exercise === 'none') continue;
    const habitIdx = baseline.exercise[m.id];
    if (typeof habitIdx !== 'number') continue;
    const sens = sensitivityOf(m.ageGroup, m.conditions);
    const limit = outdoorEffortLimit(sens);
    const habitPm = sim.ambient(habitIdx);
    const activity = EXERCISE_LABEL[m.exercise];
    const who = m.id === 'you' ? 'your' : `${m.name}'s`;
    const reason = m.conditions.length ? ` (${m.conditions.join(', ')})` : m.ageGroup !== 'adult' ? ` (${m.ageGroup})` : '';

    if (habitPm <= limit && (!cleanDaylight || habitPm <= cleanDaylight.meanPm25 * 1.2)) {
      items.push({
        id: `exercise-${m.id}`,
        kind: 'exercise',
        status: 'go',
        time: fmtHour(m.exerciseHour),
        endTime: null,
        title: `Keep ${who} ${fmtHour(m.exerciseHour)} ${activity}`,
        detail: `${fmtPm(habitPm)} at ${fmtHour(m.exerciseHour)} is within ${who} outdoor limit of ${fmtPm(limit)}${reason}.`,
        memberIds: [m.id],
        impact: { doseSavedUg: 0, exposureCutPct: 0, cigarettesAvoided: 0, co2SavedKg: 0 },
        freeAction: true,
      });
      continue;
    }

    if (cleanDaylight && cleanDaylight.meanPm25 <= limit) {
      const next = tryChange((s) => (s.exercise[m.id] = cleanDaylight.start));
      const t = span(hourly, cleanDaylight.start, cleanDaylight.end);
      accept(
        {
          id: `exercise-${m.id}`,
          kind: 'exercise',
          status: 'go',
          time: t.start,
          endTime: null,
          title: `Move ${who} ${activity} from ${fmtHour(m.exerciseHour)} to ${t.start}`,
          change: { before: `${m.name}: ${activity} outdoors at ${fmtHour(m.exerciseHour)} · ${fmtPm(habitPm)}`, after: `${m.name}: ${activity} outdoors at ${t.start} · ${fmtPm(cleanDaylight.meanPm25)}` },
          detail: `${fmtHour(m.exerciseHour)} is forecast at ${fmtPm(habitPm)}, over ${who} limit of ${fmtPm(limit)}${reason}. ${t.start} is the cleanest daylight hour at ${fmtPm(cleanDaylight.meanPm25)}, and hard breathing multiplies whatever is in the air.`,
          memberIds: [m.id],
          impact: impactBetween(baseExp, next, [m.id]),
          freeAction: true,
        },
        (s) => (s.exercise[m.id] = cleanDaylight.start),
      );
    } else {
      const next = tryChange((s) => (s.exercise[m.id] = 'indoor'));
      const best = cleanDaylight ? fmtPm(cleanDaylight.meanPm25) : 'no reading';
      accept(
        {
          id: `exercise-${m.id}`,
          kind: 'exercise',
          status: 'avoid',
          time: fmtHour(m.exerciseHour),
          endTime: null,
          title: `Take ${who} ${activity} indoors today`,
          change: { before: `${m.name}: ${activity} outdoors at ${fmtHour(m.exerciseHour)} · ${fmtPm(habitPm)}`, after: `${m.name}: ${activity} indoors, windows shut` },
          detail: `No daylight hour gets under ${who} outdoor limit of ${fmtPm(limit)}${reason}; the best is ${best}. Indoors with windows shut cuts what each deep breath carries.`,
          memberIds: [m.id],
          impact: impactBetween(baseExp, next, [m.id]),
          freeAction: true,
        },
        (s) => (s.exercise[m.id] = 'indoor'),
      );
    }
  }

  // --- 4. Commute ---------------------------------------------------------------------------
  const commuter = members.find((m) => m.id === commute.memberId);
  if (commuter && commute.mode !== 'wfh' && commute.distanceKm > 0) {
    const departIdx = nextIndexOfHour(hourly, from, to, commute.departHour);
    const ambientTrip = departIdx !== null ? sim.ambient(departIdx) : sim.ambient(from);
    const current = {
      mode: commute.mode,
      distanceKm: commute.distanceKm,
      ambientPm25: ambientTrip,
      ageGroup: commuter.ageGroup,
      n95: commute.hasN95,
    } as const;
    const ranked = rankModes(current);
    const best = ranked[0];
    const base = tripExposure(current);
    if (best && best.mode !== commute.mode) {
      const n95 = commute.hasN95 || MODES[best.mode].open;
      const co2Day = (base.co2Kg - best.co2Kg) * 2;
      const next = tryChange((s) => {
        s.commuteMode = best.mode;
        s.n95 = n95;
      });
      accept(
        {
          id: 'commute',
          kind: 'commute',
          status: 'go',
          time: fmtHour(commute.departHour),
          endTime: null,
          title: `Swap the ${MODE_LABEL[commute.mode].toLowerCase()} for the ${MODE_LABEL[best.mode].toLowerCase()}${n95 && MODES[best.mode].open ? ' with an N95' : ''}`,
          change: { before: `${MODE_LABEL[commute.mode]}, ${commute.distanceKm} km each way · ${round(base.co2Kg * 2, 2)} kg CO2e a day`, after: `${MODE_LABEL[best.mode]}${n95 && MODES[best.mode].open ? ' + N95' : ''} · ${round(best.co2Kg * 2, 2)} kg CO2e a day` },
          detail: `For ${commute.distanceKm} km each way: ${base.minutes} to ${best.minutes} min, ${round(base.co2Kg * 2, 2)} to ${round(best.co2Kg * 2, 2)} kg CO2e a day. In-transit air goes from ${fmtPm(base.breathedPm25)} to ${fmtPm(best.breathedPm25)}.`,
          memberIds: [commuter.id],
          impact: impactBetween(baseExp, next, [commuter.id], co2Day),
          freeAction: true,
        },
        (s) => {
          s.commuteMode = best.mode;
          s.n95 = n95;
        },
      );
    } else if (MODES[commute.mode as keyof typeof MODES]?.open && !commute.hasN95) {
      const next = tryChange((s) => (s.n95 = true));
      accept(
        {
          id: 'commute',
          kind: 'commute',
          status: 'caution',
          time: fmtHour(commute.departHour),
          endTime: null,
          title: 'Wear a well-fitted N95 on the commute',
          change: { before: `${MODE_LABEL[commute.mode]} without a mask`, after: `${MODE_LABEL[commute.mode]} with a sealed N95` },
          detail: `The ${MODE_LABEL[commute.mode].toLowerCase()} is already the best option for this trip, but it is open to street air. A sealed N95 removes roughly 70% of the particles.`,
          memberIds: [commuter.id],
          impact: impactBetween(baseExp, next, [commuter.id]),
          freeAction: true,
        },
        (s) => (s.n95 = true),
      );
    }

    if (commute.flexible && departIdx !== null) {
      let bestShift = 0;
      let bestPm = ambientTrip;
      for (const shift of [-2, -1, 1, 2]) {
        const idx = departIdx + shift;
        if (idx < from || idx >= to) continue;
        const pm = sim.ambient(idx);
        if (pm < bestPm * 0.8) {
          bestPm = pm;
          bestShift = shift;
        }
      }
      if (bestShift !== 0) {
        const next = tryChange((s) => (s.departShift = bestShift));
        const t = fmtHour(commute.departHour + bestShift);
        accept(
          {
            id: 'commute-time',
            kind: 'commute',
            status: 'go',
            time: t,
            endTime: null,
            title: `Leave at ${t} instead of ${fmtHour(commute.departHour)}`,
            change: { before: `Leave at ${fmtHour(commute.departHour)} · ${fmtPm(ambientTrip)} on the street`, after: `Leave at ${t} · ${fmtPm(bestPm)} on the street` },
            detail: `Your hours are flexible. Street PM2.5 drops from ${fmtPm(ambientTrip)} to ${fmtPm(bestPm)} by ${t} as the morning lid breaks up.`,
            memberIds: [commuter.id],
            impact: impactBetween(baseExp, next, [commuter.id]),
            freeAction: true,
          },
          (s) => (s.departShift = bestShift),
        );
      }
    }
  }

  // --- 5. Indoor sources -------------------------------------------------------------------
  if (home.mosquitoCoil) {
    const next = tryChange((s) => (s.coil = false));
    accept(
      {
        id: 'coil',
        kind: 'home',
        status: 'avoid',
        time: '22:00',
        endTime: null,
        title: 'Swap the mosquito coil for a net or plug-in repellent',
        change: { before: 'Mosquito coil burning 22:00 to 06:00', after: 'Bed net or plug-in repellent' },
        detail: `A burning coil adds about ${fmtPm(sourceIncrement(SOURCE_RATE.mosquitoCoil, home.ventilation, 'none', home.areaM2))} to the bedroom all night. One coil releases as much PM2.5 mass as 75 to 137 cigarettes (Liu et al., 2003).`,
        memberIds: everyone,
        impact: impactBetween(baseExp, next, everyone),
        freeAction: true,
      },
      (s) => (s.coil = false),
    );
  }
  if (home.incense) {
    const next = tryChange((s) => (s.incense = false));
    accept(
      {
        id: 'incense',
        kind: 'home',
        status: 'caution',
        time: '19:00',
        endTime: null,
        title: 'Light a diya instead of incense tonight',
        change: { before: 'Incense stick at 19:00', after: 'A diya, or nothing' },
        detail: `An incense stick adds roughly ${fmtPm(sourceIncrement(SOURCE_RATE.incense, home.ventilation, 'none', home.areaM2))} to a closed room for the hour it burns, on top of the smog that already leaked in.`,
        memberIds: everyone,
        impact: impactBetween(baseExp, next, everyone),
        freeAction: true,
      },
      (s) => (s.incense = false),
    );
  }
  if (home.indoorSmoking) {
    const next = tryChange((s) => (s.smoking = false));
    accept(
      {
        id: 'smoking',
        kind: 'home',
        status: 'avoid',
        time: null,
        endTime: null,
        title: 'Smoke outside, never in a shut house',
        change: { before: 'Smoking indoors', after: 'Smoking outside only' },
        detail: 'With windows closed for the smog, smoke has nowhere to go and everyone breathes it for hours.',
        memberIds: everyone,
        impact: impactBetween(baseExp, next, everyone),
        freeAction: true,
      },
      (s) => (s.smoking = false),
    );
  }
  {
    const capture = home.kitchenExhaust ? EXHAUST_CAPTURE : 0.3;
    const next = tryChange((s) => (s.cookingCapture = capture));
    accept(
      {
        id: 'cooking',
        kind: 'home',
        status: 'caution',
        time: '20:00',
        endTime: null,
        change: { before: 'Cooking with no extraction', after: home.kitchenExhaust ? 'Hood on high while cooking' : 'Lids on, kitchen window cracked, door shut' },
        title: home.kitchenExhaust
          ? 'Run the kitchen exhaust from first flame to 10 min after'
          : 'Cook with lids on and crack only the kitchen window',
        detail: home.kitchenExhaust
          ? 'A hood running on high removes about 60% of frying smoke at source, before it spreads to bedrooms.'
          : 'No exhaust fan, so contain it: lids cut oil smoke, and a cracked kitchen window with the door shut keeps the plume out of the rest of the house.',
        memberIds: everyone,
        impact: impactBetween(baseExp, next, everyone),
        freeAction: true,
      },
      (s) => (s.cookingCapture = capture),
    );
  }

  // --- 6. Filtration ------------------------------------------------------------------------
  if (home.purifier !== 'none') {
    const next = tryChange((s) => (s.purifier = home.purifier));
    const room = simulateRoom({ outdoorPm25: sim.ambient(from), areaM2: home.areaM2, ventilation: home.ventilation, windowsOpen: false, purifier: home.purifier });
    accept(
      {
        id: 'purifier',
        kind: 'home',
        status: 'go',
        time: fmtHour(hourOf(hourly[from]!.time)),
        endTime: null,
        title: 'Run the purifier on high with the bedroom door shut',
        change: { before: 'Purifier off or on low', after: 'Purifier on high, bedroom door shut' },
        detail: `In a ${home.areaM2} m² room it adds ${round(room.purifierAch, 1)} clean-air changes an hour and settles in about ${Math.round(room.timeConstantMin * 3)} min. Running it only at night leaves the evening peak untouched.`,
        memberIds: everyone,
        impact: impactBetween(baseExp, next, everyone),
        freeAction: true,
      },
      (s) => (s.purifier = home.purifier),
    );
  } else {
    const next = tryChange((s) => (s.purifier = 'diy'));
    items.push({
      id: 'diy-filter',
      kind: 'upgrade',
      status: 'caution',
      time: null,
      endTime: null,
      title: 'Build a box-fan filter for the bedroom',
      change: { before: 'No filtration', after: 'Box-fan filter running in the bedroom' },
      detail: 'Tape four MERV-13 filters around a box fan (a Corsi-Rosenthal box). It moves roughly 550 m³ of filtered air an hour, comparable to a large purifier, for the cost of the filters.',
      memberIds: everyone,
      impact: impactBetween(baseExp, next, everyone),
      freeAction: false,
    });
  }

  // --- 7. Fuel upgrades (sustainable alternatives) ------------------------------------------
  if (home.heating === 'wood' || home.heating === 'coal') {
    const next = tryChange((s) => (s.heatingRate = 0));
    items.push({
      id: 'heating',
      kind: 'upgrade',
      status: 'avoid',
      time: '19:00',
      endTime: null,
      title: `Replace the ${home.heating} heater with an electric one or extra layers`,
      change: { before: `${home.heating} heater indoors`, after: 'Electric heater or extra layers' },
      detail: 'Solid-fuel heaters fill a sealed room with smoke and carbon monoxide, and their smoke joins the city-wide lid outside.',
      memberIds: everyone,
      impact: impactBetween(baseExp, next, everyone),
      freeAction: false,
    });
  }
  if (home.cooking === 'biomass') {
    const next = tryChange((s) => (s.cookingRate = SOURCE_RATE.fryingGas));
    items.push({
      id: 'clean-cooking',
      kind: 'upgrade',
      status: 'caution',
      time: null,
      endTime: null,
      title: 'Move cooking from the chulha to LPG or induction',
      change: { before: 'Cooking on a chulha', after: 'Cooking on LPG or induction' },
      detail: 'Wood and dung stoves are among the largest single sources of household PM2.5 in India.',
      memberIds: everyone,
      impact: impactBetween(baseExp, next, everyone),
      freeAction: false,
    });
  }

  // --- Totals -------------------------------------------------------------------------------
  const optExp = sim.household(optimized);
  const memberSummaries: MemberSummary[] = members.map((m) => {
    const b = baseExp.get(m.id)!;
    const o = optExp.get(m.id)!;
    const sens = sensitivityOf(m.ageGroup, m.conditions);
    return {
      id: m.id,
      name: m.name,
      sensitivity: sens,
      pm25Limit: outdoorEffortLimit(sens),
      budgetUg: round(WHO_PM25_24H * b.breathedM3),
      baselineDoseUg: round(b.doseUg),
      optimizedDoseUg: round(o.doseUg),
      baselineCigarettes: round(cigarettesFromConcHours(b.concHours), 2),
      optimizedCigarettes: round(cigarettesFromConcHours(o.concHours), 2),
    };
  });
  const totalImpact = impactBetween(baseExp, optExp, everyone);
  const co2Day = items.filter((i) => i.freeAction && (!options.only || options.only.has(i.id))).reduce((s, i) => s + i.impact.co2SavedKg, 0);
  const workDays = commute.mode === 'wfh' ? 0 : commute.daysPerWeek;

  const series = aqiSeries(hourly, household.standard);
  const nowAqi = series[nowIndex] ?? { aqi: 0, dominant: 'pm25' as Pollutant };
  const cat = aqiCategory(nowAqi.aqi, household.standard);

  const order: Record<RoutineStatus, number> = { avoid: 0, go: 1, caution: 2 };
  items.sort((a, b) => {
    if (a.freeAction !== b.freeAction) return a.freeAction ? -1 : 1;
    if (b.impact.doseSavedUg !== a.impact.doseSavedUg) return b.impact.doseSavedUg - a.impact.doseSavedUg;
    return order[a.status] - order[b.status];
  });

  const cleanOut = clean ? { ...span(hourly, clean.start, clean.end), pm25: round(clean.meanPm25) } : null;
  const worstOut = worst ? { ...span(hourly, worst.start, worst.end), pm25: round(worst.meanPm25) } : null;
  const lidOut = lids.map((l) => ({ ...span(hourly, l.start, l.end), minBlh: round(l.minBlh) }));

  const headline =
    lidOut.length > 0
      ? `Smog lid ${lidOut[0]!.start} to ${lidOut[0]!.end}: air can only mix ${lidOut[0]!.minBlh} m high.${cleanOut ? ` Cleanest hour is ${cleanOut.start}.` : ''} Today's plan cuts your household's dose by ${Math.round(totalImpact.exposureCutPct)}%.`
      : `Air is ${cat.label.toLowerCase()} (AQI ${nowAqi.aqi}).${cleanOut ? ` Cleanest hour is ${cleanOut.start}.` : ''} Today's plan cuts your household's dose by ${Math.round(totalImpact.exposureCutPct)}%.`;

  return {
    placeLabel: air.place.label,
    generatedAt: now.toISOString(),
    horizon: span(hourly, from, to),
    risk: { aqi: nowAqi.aqi, level: cat.level, label: cat.label, advice: cat.advice, dominant: nowAqi.dominant, standard: household.standard },
    current: {
      pm25: nowHour?.pm25 ?? null,
      blh: nowHour?.blh ?? null,
      wind: nowHour?.wind ?? null,
      ventilationCoefficient: vcNow == null ? null : round(vcNow),
      dispersion: dispersionClass(vcNow),
    },
    lid: { spans: lidOut, stagnantHours: lids.reduce((s, l) => s + (l.end - l.start), 0) },
    cleanWindow: cleanOut,
    worstWindow: worstOut,
    headline,
    items,
    members: memberSummaries,
    totals: {
      baselineDoseUg: round([...baseExp.values()].reduce((s, e) => s + e.doseUg, 0)),
      optimizedDoseUg: round([...optExp.values()].reduce((s, e) => s + e.doseUg, 0)),
      exposureCutPct: totalImpact.exposureCutPct,
      cigarettesAvoided: totalImpact.cigarettesAvoided,
      co2SavedKgDay: round(co2Day, 2),
      co2SavedKgWeek: round(co2Day * workDays, 1),
    },
  };
}

