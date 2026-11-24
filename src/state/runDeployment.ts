/**
 * One deployment, start to finish: read the live air from the shared cache, narrate what the local
 * planner finds, and ask the server for the explained plan.
 */
import type { QueryClient } from '@tanstack/react-query';
import { airQueryOptions, withPlaceLabel } from '@/hooks/useAir';
import { requestPlan } from '@/lib/api';
import type { PlanResponse } from '@/lib/apiTypes';
import type { Place } from '@/lib/air/types';
import { buildPlan } from '@/lib/planner/engine';
import type { Household } from '@/lib/profile/schema';
import { MODE_LABEL } from '@/lib/science/commute';
import type { Deployment, LogKind } from './deploymentModel';

type Log = (kind: LogKind, text: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DeployInput {
  place: Place;
  household: Household;
  /** Appends one line to the build log. */
  log: Log;
  /** Pause between narrated steps in milliseconds; zero for reduced motion. */
  pace: number;
  /** The app's query cache, which already holds the air data the pages are showing. */
  queryClient: QueryClient;
}

/** Narrates what the local engine found: the smog lid, the baseline dose and the changes tested. */
async function narrateLocalPlan(
  local: ReturnType<typeof buildPlan>,
  { household, log, pace }: DeployInput,
) {
  const lidded = local.lid.stagnantHours > 0;
  log(
    lidded ? 'warn' : 'ok',
    lidded
      ? `Smog lid detected: ${local.lid.spans.map((s) => `${s.start} to ${s.end} at ${s.minBlh} m`).join(', ')}`
      : 'No smog lid in the next 24 h',
  );
  await sleep(pace);
  log(
    'info',
    `Simulating ${household.members.length} people × 24 h as usual: ${local.totals.baselineDoseUg.toLocaleString('en-IN')} µg inhaled`,
  );
  await sleep(pace);
  const c = household.commute;
  log(
    'info',
    `Testing ${local.items.length} changes (commute: ${MODE_LABEL[c.mode].toLowerCase()}, ${c.distanceKm} km)`,
  );
  await sleep(pace);
}

/** Says which provider wrote the explanations, or that the rules engine stepped in. */
function logProvider(response: PlanResponse, log: Log) {
  const count = response.ai?.items.length ?? 0;
  if (response.source === 'gemini') {
    log('ok', `Gemini (${response.model}) wrote ${count} explanations`);
  } else if (response.source === 'claude') {
    log('ok', `Gemini busy, Claude (${response.model}) wrote ${count} explanations`);
  } else {
    log('warn', 'AI providers unavailable, using the rules engine explanations');
  }
}

/**
 * Runs one deployment end to end: take the live air from the query cache (fetching only when it
 * is missing or stale, and joining a request that is already in flight), run the planner locally
 * to narrate real numbers, then ask the server for the explained plan. Rejects if any step fails.
 */
export async function runDeployment(input: DeployInput): Promise<Deployment> {
  const { place, household, log, pace, queryClient } = input;
  log('info', `Fetching live air quality for ${place.label} (Open-Meteo, CAMS model)`);
  const cached = await queryClient.query(airQueryOptions(place));
  const air = withPlaceLabel(cached, place.label);
  const now = air.hourly[air.nowIndex];
  log(
    'ok',
    `${air.hourly.length} hourly readings. Now PM2.5 ${Math.round(now?.pm25 ?? 0)} µg/m³, mixing height ${Math.round(now?.blh ?? 0)} m`,
  );
  await sleep(pace);
  await narrateLocalPlan(buildPlan(household, air), input);
  log(
    'ai',
    'Asking Gemini to explain the plan and tailor indoor hacks and swaps (Claude Haiku as fallback)',
  );
  const response = await requestPlan(place, household);
  logProvider(response, log);
  const t = response.plan.totals;
  log(
    'ok',
    `Ready: dose −${Math.round(t.exposureCutPct)}%, ${t.cigarettesAvoided} cigarette-equivalents avoided, ${t.co2SavedKgWeek} kg CO2e saved a week`,
  );
  return {
    id: Math.random().toString(36).slice(2, 9),
    at: new Date().toISOString(),
    placeLabel: place.label,
    cutPct: t.exposureCutPct,
    source: response.source,
    model: response.model,
    response,
  };
}
