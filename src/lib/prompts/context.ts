/**
 * The CONTEXT block of every prompt: the engine's plan and the household profile as plain text.
 * The numbers are the engine's; everything a user typed sits in a data tag. Shared by the server
 * prompts and the browser's on-device prompts.
 */
import type { Household } from '../profile/schema.js';
import type { PlanResult } from '../planner/engine.js';
import { MODE_LABEL } from '../science/commute.js';
import { asData, neutralise } from './guardrails.js';

const conditionText = (c: string[]) => (c.length ? `, ${c.join(', ')}` : '');

/** The household profile as a <household> data block the model must not treat as instructions. */
export function describeHousehold(h: Household): string {
  const people = h.members
    .map(
      (m) =>
        `- ${neutralise(m.name)}: ${m.ageGroup}${conditionText(m.conditions)}; daytime at ${m.daytime}; exercise ${m.exercise === 'none' ? 'none' : `${m.exercise} at ${String(m.exerciseHour).padStart(2, '0')}:00 for ${m.exerciseMinutes} min`}`,
    )
    .join('\n');
  const c = h.commute;
  const commuter = neutralise(h.members.find((m) => m.id === c.memberId)?.name ?? 'one member');
  const home = h.home;
  return `<household>
Name: ${neutralise(h.name)}
People:
${people}
Commute: ${commuter}, ${MODE_LABEL[c.mode]}, ${c.distanceKm} km each way, leaves ${c.departHour}:00, returns ${c.returnHour}:00, ${c.daysPerWeek} days a week, flexible hours: ${c.flexible ? 'yes' : 'no'}, owns N95: ${c.hasN95 ? 'yes' : 'no'}
Home: ${home.areaM2} m² kept closed, ${home.ventilation} draught-proofing, purifier: ${home.purifier}, usually airs at ${home.airingHour}:00, cooks on ${home.cooking}${home.kitchenExhaust ? ' with exhaust' : ' without exhaust'}, heating: ${home.heating}, incense: ${home.incense ? 'yes' : 'no'}, mosquito coil: ${home.mosquitoCoil ? 'yes' : 'no'}, indoor smoking: ${home.indoorSmoking ? 'yes' : 'no'}
</household>`;
}

/**
 * The engine's plan as plain-text CONTEXT, so every number the model quotes comes from here.
 * The numbers are the engine's; the place label, the member names and the advice text that quotes
 * them came from the user, so each sits in its own data tag.
 */
export function describePlan(plan: PlanResult): string {
  const items = plan.items
    .map(
      (i) =>
        `- id=${neutralise(i.id)} [${i.status}${i.freeAction ? '' : ', upgrade'}] ${i.time ?? 'any time'}: ${asData('item', `${i.title}. ${i.detail}`)} Impact: ${i.impact.doseSavedUg} µg less inhaled (${i.impact.exposureCutPct}% of the affected people's day), ${i.impact.cigarettesAvoided} cigarette-equivalents avoided, ${i.impact.co2SavedKg} kg CO2e saved per day.`,
    )
    .join('\n');
  const members = plan.members
    .map(
      (m) =>
        `- ${asData('name', m.name)}: outdoor PM2.5 limit ${m.pm25Limit} µg/m³; WHO-level daily budget ${m.budgetUg} µg; today as usual ${m.baselineDoseUg} µg (${m.baselineCigarettes} cigarettes); with plan ${m.optimizedDoseUg} µg (${m.optimizedCigarettes} cigarettes)`,
    )
    .join('\n');
  const lid = plan.lid.spans
    .map((s) => `${s.start} to ${s.end} (mixing height down to ${s.minBlh} m)`)
    .join('; ');
  return `Location: ${asData('place', plan.placeLabel)}. Plan covers ${plan.horizon.start} to ${plan.horizon.end} local time.
Now: AQI ${plan.risk.aqi} (${plan.risk.standard === 'in' ? 'India NAQI' : 'US EPA'}), "${plan.risk.label}", dominant ${plan.risk.dominant}. PM2.5 ${plan.current.pm25 ?? 'n/a'} µg/m³, mixing height ${plan.current.blh ?? 'n/a'} m, wind ${plan.current.wind ?? 'n/a'} km/h, dispersion ${plan.current.dispersion ?? 'n/a'}.
Smog lid hours: ${lid || 'none in the next 24 h'}.
Cleanest daytime hour: ${plan.cleanWindow ? `${plan.cleanWindow.start} at ${plan.cleanWindow.pm25} µg/m³` : 'n/a'}. Dirtiest 3 h: ${plan.worstWindow ? `${plan.worstWindow.start} to ${plan.worstWindow.end} at ${plan.worstWindow.pm25} µg/m³` : 'n/a'}.
Household totals: ${plan.totals.baselineDoseUg} µg as usual vs ${plan.totals.optimizedDoseUg} µg with the plan (${plan.totals.exposureCutPct}% less), ${plan.totals.cigarettesAvoided} cigarette-equivalents avoided, ${plan.totals.co2SavedKgWeek} kg CO2e saved per week.
People:
${members}
Routine items:
${items}
Cigarette equivalence: 22 µg/m³ of PM2.5 breathed for 24 h is about one cigarette (Berkeley Earth).`;
}

/** The /api/plan user prompt: CONTEXT plus the writing task that matches the response schema. */
export function buildPlanPrompt(plan: PlanResult, household: Household): string {
  return `CONTEXT
${describePlan(plan)}

${describeHousehold(household)}

TASK
Write the headline and summary for today, a personal "why" for every routine item id above (same ids, same order), three indoor-air hacks that fit this home and are not already in the routine, three sustainable low-emission swaps for this household and city, and a short note for the most sensitive person if there is one.`;
}

/** The first chat turn: CONTEXT only. The user's messages follow as separate turns. */
export function buildChatContext(plan: PlanResult, household: Household): string {
  return `CONTEXT
${describePlan(plan)}

${describeHousehold(household)}`;
}
