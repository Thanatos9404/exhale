/**
 * What the Assistant shows around a conversation: starter questions fitted to the household and
 * city, and short text summaries of the air and the plan. Pure functions with no React.
 */
import type { Place } from '@/lib/air/types';
import type { PlanResult } from '@/lib/planner/engine';
import type { Household, Member } from '@/lib/profile/schema';
import { defined } from '@/lib/assert';
import { fmtInt } from '@/lib/format';

/** A starter question; `search` marks the ones that need live web results. */
export interface Suggestion {
  q: string;
  search: boolean;
}

/** The person answers should centre on: the first child or member with a condition, else the first. */
export function mostSensitiveMember(household: Household): Member {
  return (
    household.members.find((m) => m.conditions.length > 0 || m.ageGroup === 'child') ??
    defined(household.members[0], 'household member')
  );
}

/** Starter questions tailored to the household and the selected city. */
export function buildSuggestions(household: Household, place: Place): Suggestion[] {
  const sensitive = mostSensitiveMember(household);
  return [
    { q: `When can ${sensitive.name} safely go outside today?`, search: false },
    { q: 'Is my commute better by metro or car today, and by how much?', search: false },
    { q: 'How do I build a box-fan air filter at home?', search: false },
    { q: 'Why is the air worst at night and early morning in winter?', search: false },
    {
      q: `What pollution restrictions are in force in ${place.label.split(',')[0]} today?`,
      search: true,
    },
  ];
}

/** One-line summary of the air right now, for the empty conversation. */
export function airSummary(plan: PlanResult | null): string {
  return plan
    ? `${plan.placeLabel}: AQI ${plan.risk.aqi}, ${plan.risk.label.toLowerCase()}.`
    : 'Loading live data…';
}

/** Current AQI and PM2.5; a missing reading says so rather than showing zero. */
export function airNowText(plan: PlanResult): string {
  const pm25 = plan.current.pm25;
  const reading = pm25 === null ? 'n/a' : `${fmtInt(pm25)} µg/m³`;
  return `AQI ${plan.risk.aqi} · PM2.5 ${reading}`;
}

/** The first smog-lid span of the day, or "None". */
export function smogLidText(plan: PlanResult): string {
  const span = plan.lid.spans[0];
  return span ? `${span.start} to ${span.end} at ${span.minBlh} m` : 'None';
}

/** The cleanest hour ahead with its PM2.5, or "n/a". */
export function cleanHourText(plan: PlanResult): string {
  return plan.cleanWindow ? `${plan.cleanWindow.start} · ${plan.cleanWindow.pm25} µg/m³` : 'n/a';
}

/** Number of plan actions and the dose they cut. */
export function planText(plan: PlanResult): string {
  return `${plan.items.length} actions · −${Math.round(plan.totals.exposureCutPct)}% dose`;
}
