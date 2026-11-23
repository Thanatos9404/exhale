import type { PlanResult, RoutineItem } from '../src/lib/planner/engine.js';

/**
 * Offline answers built from the engine's plan, used when Gemini is not configured or
 * unavailable. They keep the assistant useful and honest: every figure comes from the plan.
 */

const bullet = (i: RoutineItem) =>
  `- **${i.time ? `${i.time} ` : ''}${i.title}.** ${i.detail}${i.impact.doseSavedUg > 0 ? ` Saves about ${i.impact.doseSavedUg.toLocaleString('en-IN')} µg (${i.impact.cigarettesAvoided} cigarette-equivalents).` : ''}`;

const INTENTS: { test: RegExp; pick: (p: PlanResult) => RoutineItem[]; intro: (p: PlanResult) => string }[] = [
  {
    test: /walk|run|jog|exercise|play|outside|outdoor|park|cycle|gym/i,
    pick: (p) => p.items.filter((i) => i.kind === 'exercise' || i.kind === 'ventilate'),
    intro: (p) =>
      p.cleanWindow
        ? `The cleanest daylight hour today is **${p.cleanWindow.start}** at about ${p.cleanWindow.pm25} µg/m³ of PM2.5.`
        : 'There is no clearly clean hour in today’s forecast.',
  },
  {
    test: /commute|office|metro|car|bus|drive|travel|auto|bike|scooter/i,
    pick: (p) => p.items.filter((i) => i.kind === 'commute'),
    intro: () => 'Here is what the numbers say about your commute.',
  },
  {
    test: /window|ventilat|air out|fresh air|open/i,
    pick: (p) => p.items.filter((i) => i.kind === 'ventilate' || i.kind === 'protect'),
    intro: (p) =>
      p.lid.stagnantHours > 0
        ? `A smog lid covers ${p.lid.stagnantHours} of the next 24 hours, so timing matters.`
        : 'Dispersion is reasonable today.',
  },
  {
    test: /purifier|filter|indoor|home|room|coil|incense|cook|kitchen|smoke|heater/i,
    pick: (p) => p.items.filter((i) => i.kind === 'home' || i.kind === 'upgrade'),
    intro: () => 'Indoor air is where your family spends most hours, so these matter most.',
  },
  {
    test: /mask|n95|kn95/i,
    pick: (p) => p.items.filter((i) => /N95/.test(i.title) || i.kind === 'commute'),
    intro: () =>
      'A well-fitted N95 or FFP2 removes most fine particles; cloth and surgical masks do little against PM2.5. Fit matters more than brand: no gaps at the nose or cheeks.',
  },
];

export function fallbackAnswer(question: string, plan: PlanResult): string {
  const intent = INTENTS.find((i) => i.test.test(question));
  const items = intent ? intent.pick(plan).slice(0, 4) : plan.items.filter((i) => i.freeAction).slice(0, 4);
  const intro = intent ? intent.intro(plan) : plan.headline;
  const body = items.length ? items.map(bullet).join('\n') : '- Nothing specific to change for this today.';
  return `${intro}\n\n${body}\n\n_Answered by Exhale's offline engine. Add a Gemini API key on the server for full conversational answers._`;
}
