/**
 * Builds the neighbourhood air bulletin: a short, public message one resident can post to a
 * housing-society or school group. It reads only the ambient facts of a plan (AQI, smog-lid
 * hours, cleanest and dirtiest hours), never the household, so nothing personal can leak.
 */
import type { Place } from '../air/types.js';
import type { PlanResult } from '../planner/types.js';
import { outdoorEffortLimit, SENSITIVITY } from '../science/exposure.js';
import {
  categoryName,
  MESSAGES,
  type AdvisoryLanguage,
  type AdvisoryMessages,
} from './messages.js';

export type { AdvisoryLanguage } from './messages.js';

/** Longest plain text the bulletin may be, so it fits in one chat message. */
export const ADVISORY_MAX_CHARS = 900;

/** Longest place label printed; the app itself stores labels of up to 80 characters. */
const PLACE_MAX_CHARS = 80;

/** Lid spans named one by one before the rest are only counted. */
const LISTED_SPANS = 2;

/** Highest outdoor PM2.5 the engine allows for a child's exercise, µg/m³. */
const CHILD_PM25_LIMIT = outdoorEffortLimit(SENSITIVITY.child);

/**
 * The public part of a plan: what the air is doing, with no members, items or doses. A full
 * `PlanResult` fits this shape, and the type stops this module reading anything else from it.
 */
export interface PublicPlanFacts {
  generatedAt: PlanResult['generatedAt'];
  risk: Pick<PlanResult['risk'], 'aqi' | 'level' | 'label' | 'standard'>;
  current: Pick<PlanResult['current'], 'blh'>;
  lid: PlanResult['lid'];
  cleanWindow: PlanResult['cleanWindow'];
  worstWindow: PlanResult['worstWindow'];
}

/** Where the bulletin is for; the time zone puts the plan's timestamp on the local calendar. */
export type AdvisoryPlace = Pick<Place, 'label' | 'timezone'>;

/** The bulletin as data, plus the plain text to paste into a chat. */
export interface CommunityAdvisory {
  language: AdvisoryLanguage;
  /** The place label as printed: whitespace collapsed, clipped to 80 characters. */
  place: string;
  /** Local calendar date of the plan, or null when its timestamp is unreadable. */
  date: string | null;
  /** AQI category in the bulletin's language. */
  category: string;
  /** True when the whole day is clean and the bulletin carries no restrictions. */
  cleanDay: boolean;
  title: string;
  /** AQI, smog lid and cleanest hour, one line each. */
  facts: string[];
  heading: string;
  /** Community-level actions, most urgent first. */
  actions: string[];
  source: string;
  /** Everything above as one message of at most `ADVISORY_MAX_CHARS` characters. */
  text: string;
}

/** Cuts text to `max` UTF-16 units without splitting a character, marking the cut. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = '';
  for (const char of text) {
    if (out.length + char.length > max - 1) break;
    out += char;
  }
  return `${out.trimEnd()}…`;
}

/** Day, month and year of an instant on the calendar of `timeZone`; null if the zone is unknown. */
function calendarParts(at: Date, timeZone: string): Record<string, number> | null {
  try {
    const format = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    return Object.fromEntries(format.formatToParts(at).map((p) => [p.type, Number(p.value)]));
  } catch {
    return null;
  }
}

/** "23 Nov 2026" in the place's own time zone (UTC when it has none), with Western digits. */
function localDate(iso: string, timeZone: string | undefined, months: readonly string[]) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const local = timeZone ? calendarParts(at, timeZone) : null;
  const { day, month, year } = local ?? calendarParts(at, 'UTC') ?? {};
  if (day === undefined || month === undefined || year === undefined) return null;
  return `${day} ${months[month - 1] ?? month} ${year}`;
}

/** The smog-lid line: its hours and lowest mixing height, or why there is nothing to report. */
function lidFact(facts: PublicPlanFacts, m: AdvisoryMessages): string {
  const { spans } = facts.lid;
  if (spans.length === 0) return facts.current.blh === null ? m.lidUnknown : m.noLid;
  const listed = spans.slice(0, LISTED_SPANS).map(m.range);
  const lowest = Math.min(...spans.map((span) => span.minBlh));
  return m.lid(m.list(listed, spans.length - listed.length), Math.round(lowest));
}

/**
 * A clean day needs positive evidence: a good or satisfactory AQI, no lid, and a dirtiest
 * three-hour run that a child could still play through. Missing readings never count as clean.
 */
function isCleanDay({ risk, lid, worstWindow }: PublicPlanFacts): boolean {
  if (risk.level > 1 || lid.spans.length > 0 || worstWindow === null) return false;
  return worstWindow.pm25 <= CHILD_PM25_LIMIT;
}

/** Where school play goes: the clean window, or indoors when no hour is clean enough. */
function playAction(clean: PublicPlanFacts['cleanWindow'], m: AdvisoryMessages): string {
  if (clean === null) return m.playNoForecast;
  if (clean.pm25 > CHILD_PM25_LIMIT) return m.playIndoors(CHILD_PM25_LIMIT);
  return m.playWindow(m.range(clean));
}

/** The shared airing time, with a reminder to stay shut while the lid is on. */
function airingAction(facts: PublicPlanFacts, m: AdvisoryMessages): string {
  if (facts.cleanWindow === null) return m.airingNoForecast;
  const hours = m.range(facts.cleanWindow);
  return facts.lid.spans.length > 0 ? m.airingLid(hours) : m.airing(hours);
}

/** What the neighbourhood can do, each line tied to one fact of the day. */
function actionsFor(facts: PublicPlanFacts, m: AdvisoryMessages): string[] {
  if (isCleanDay(facts)) return [m.cleanOutdoors, m.cleanKeep];
  const peak = facts.worstWindow ? m.range(facts.worstWindow) : null;
  return [
    facts.lid.spans.length > 0 ? m.burnLid : m.burn,
    playAction(facts.cleanWindow, m),
    airingAction(facts, m),
    peak ? m.commutePeak(peak) : m.commute,
    peak ? m.checkPeak(peak) : m.check,
  ];
}

type Sections = Pick<CommunityAdvisory, 'title' | 'facts' | 'heading' | 'actions' | 'source'>;

/** The sections as one chat message: blank lines between blocks, actions numbered. */
function render({ title, facts, heading, actions, source }: Sections): string {
  const numbered = actions.map((action, i) => `${i + 1}. ${action}`);
  return [title, facts.join('\n'), [heading, ...numbered].join('\n'), source].join('\n\n');
}

/**
 * Keeps the message inside the cap. Real days fit with room to spare; only absurd inputs get
 * here, and then the last actions go first so the facts and the source always survive.
 */
function fitToCap(sections: Sections): Pick<CommunityAdvisory, 'actions' | 'text'> {
  let { actions } = sections;
  let text = render(sections);
  while (text.length > ADVISORY_MAX_CHARS && actions.length > 0) {
    actions = actions.slice(0, -1);
    text = render({ ...sections, actions });
  }
  return { actions, text: clip(text, ADVISORY_MAX_CHARS) };
}

/**
 * The day's bulletin for a neighbourhood, in English or Hindi. Pure and deterministic: the
 * same facts, place and language always give the same message.
 */
export function buildCommunityAdvisory(
  plan: PublicPlanFacts,
  place: AdvisoryPlace,
  language: AdvisoryLanguage,
): CommunityAdvisory {
  const m = MESSAGES[language];
  const { risk } = plan;
  const label = clip(place.label.replace(/\s+/g, ' ').trim(), PLACE_MAX_CHARS);
  const date = localDate(plan.generatedAt, place.timezone, m.months);
  const category = categoryName(m, risk.standard, risk.level, risk.label);
  const cleanDay = isCleanDay(plan);
  const sections: Sections = {
    title: m.title(label, date),
    facts: [
      m.aqi(Math.round(risk.aqi), category, m.scale[risk.standard]),
      lidFact(plan, m),
      plan.cleanWindow
        ? m.cleanest(m.range(plan.cleanWindow), Math.round(plan.cleanWindow.pm25))
        : m.noForecast,
    ],
    heading: cleanDay ? m.cleanHeading : m.heading,
    actions: actionsFor(plan, m),
    source: m.source,
  };
  return {
    language,
    place: label,
    date,
    category,
    cleanDay,
    ...sections,
    ...fitToCap(sections),
  };
}
