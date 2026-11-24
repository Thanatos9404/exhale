/**
 * Fixture builders for the end-to-end suite.
 *
 * Everything the browser would fetch from the network is built here from the app's own test
 * fixtures (`src/test/fixtures.ts`) and its deterministic planner, so mocked responses always
 * have the exact shapes the real providers and the real `/api/*` functions return.
 */
import type { AiPlan, HealthResponse, PlanResponse } from '@/lib/apiTypes';
import { buildPlan, type PlanResult } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD, parseHousehold, type Household } from '@/lib/profile/schema';
import { makeSnapshot, openMeteoPayloads } from '@/test/fixtures';

/** The synthetic Delhi winter day every test runs against. */
export const SNAPSHOT = makeSnapshot();

/** The raw Open-Meteo air-quality and forecast responses for `SNAPSHOT`. */
export const OPEN_METEO = openMeteoPayloads(SNAPSHOT);

/** The instant of the fixture's `nowIndex` hour: its local wall-clock time minus the UTC offset. */
export const NOW = new Date(
  Date.parse(`${SNAPSHOT.current.time}:00Z`) - SNAPSHOT.utcOffsetSeconds * 1000,
);

/** The household the app starts with before anyone edits it. */
export const HOUSEHOLD = DEFAULT_HOUSEHOLD;

/** Model ids the mocked API reports, so tests can tell fixture output from anything real. */
export const MODELS = { gemini: 'gemini-e2e-fixture', claude: 'claude-haiku-e2e-fixture' } as const;

/** The plan the app computes locally for the fixture day; `only` limits the applied free actions. */
export function localPlan(household: Household = HOUSEHOLD, only?: Iterable<string>): PlanResult {
  return buildPlan(household, SNAPSHOT, NOW, only ? { only: new Set(only) } : {});
}

/** The explanation the fixture "model" writes for one routine item. */
export const whyFor = (title: string) => `Fixture reason: ${title}`.slice(0, 320);

/** AI wording for a plan, with one explanation per routine item. */
export function aiPlan(plan: PlanResult): AiPlan {
  return {
    headline: 'Fixture headline: stay in until the smog lid lifts',
    summary: 'Fixture summary: the lid holds until mid-morning, so every outdoor plan moves later.',
    items: plan.items.map((item) => ({ id: item.id, why: whyFor(item.title) })),
    indoorHacks: [
      {
        title: 'Fixture hack: seal the bedroom window gaps',
        detail: 'Weather-strip the frame so less outdoor air leaks in overnight.',
        impact: 'Roughly a fifth less PM2.5 indoors',
      },
    ],
    sustainableSwaps: [
      {
        title: 'Fixture swap: metro twice a week',
        detail: 'Replace two car commutes with the metro.',
        impact: 'About 5 kg CO2e saved a week',
      },
    ],
    familyNote: 'Fixture note: keep the reliever inhaler close before the lid lifts.',
  };
}

/** The household posted to `/api/plan` or `/api/chat`, or the default when the body has none. */
function postedHousehold(body: unknown): Household {
  const raw =
    typeof body === 'object' && body !== null && 'household' in body ? body.household : null;
  return parseHousehold(raw) ?? HOUSEHOLD;
}

/** A successful `/api/plan` body from the given provider, planned for the posted household. */
export function planResponse(source: PlanResponse['source'], requestBody?: unknown): PlanResponse {
  const plan = localPlan(postedHousehold(requestBody));
  if (source === 'rules') return { plan, ai: null, source, model: null };
  return { plan, ai: aiPlan(plan), source, model: MODELS[source] };
}

/** `/api/health` with an AI provider configured. */
export const HEALTH: HealthResponse = {
  ok: true,
  ai: true,
  model: MODELS.gemini,
  providers: ['gemini', 'claude'],
};

/** The assistant's streamed answer, in Markdown like the real model writes. */
export const CHAT_ANSWER =
  'Open the windows at **13:00**, when PM2.5 dips to 70 µg/m³. Keep them shut before 10:00.';

/** How `CHAT_ANSWER` reads once the Markdown is rendered. */
export const CHAT_ANSWER_TEXT = CHAT_ANSWER.replaceAll('**', '');

/** One Open-Meteo geocoding hit. */
export interface GeoHit {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1: string;
  timezone: string;
}

/** Cities the mocked geocoder knows. A query matches by name prefix; anything else finds nothing. */
export const CITIES: readonly GeoHit[] = [
  {
    id: 1275339,
    name: 'Mumbai',
    latitude: 19.07283,
    longitude: 72.88261,
    country: 'India',
    admin1: 'Maharashtra',
    timezone: 'Asia/Kolkata',
  },
];

/** Open-Meteo's geocoding body for a query; `results` is absent when nothing matches. */
export function geocodeResponse(query: string): { results?: GeoHit[] } {
  const q = query.trim().toLowerCase();
  const results = CITIES.filter((city) => q.length > 0 && city.name.toLowerCase().startsWith(q));
  return results.length > 0 ? { results } : {};
}

/** Where the emulated device is, and what BigDataCloud calls that spot. */
export const DEVICE_LOCATION = { latitude: 26.9124, longitude: 75.7873 } as const;
export const REVERSE_GEOCODE = {
  city: 'Jaipur',
  locality: 'Jaipur',
  countryName: 'India',
} as const;
