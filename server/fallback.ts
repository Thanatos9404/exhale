import type { PlanResult, RoutineItem } from '../src/lib/planner/engine.js';

/**
 * Offline answers built from the engine's plan, used when Gemini is not configured or
 * unavailable. They keep the assistant useful and honest: every figure comes from the plan.
 */

const bullet = (i: RoutineItem) =>
  `- **${i.time ? `${i.time} ` : ''}${i.title}.** ${i.detail}${i.impact.doseSavedUg > 0 ? ` Saves about ${i.impact.doseSavedUg.toLocaleString('en-IN')} µg (${i.impact.cigarettesAvoided} cigarette-equivalents).` : ''}`;

/*
 * Topic patterns anchor at a word start so "care" never reads as "car". Stems such as "ventilat"
 * and "cycl" stay open-ended to catch their inflections; short words that are prefixes of
 * unrelated words (car, bus, auto, bike, mask) are closed with a word end.
 */
const INTENTS: {
  test: RegExp;
  pick: (p: PlanResult) => RoutineItem[];
  intro: (p: PlanResult) => string;
}[] = [
  {
    test: /\b(?:walk|run|jog|exercis|play|outside|outdoor|park|cycl|gym)/i,
    pick: (p) => p.items.filter((i) => i.kind === 'exercise' || i.kind === 'ventilate'),
    intro: (p) =>
      p.cleanWindow
        ? `The cleanest daylight hour today is **${p.cleanWindow.start}** at about ${p.cleanWindow.pm25} µg/m³ of PM2.5.`
        : 'There is no clearly clean hour in today’s forecast.',
  },
  {
    test: /\b(?:commut|office|metro|cars?\b|bus(?:es)?\b|driv|travel|autos?\b|bikes?\b|scooter)/i,
    pick: (p) => p.items.filter((i) => i.kind === 'commute'),
    intro: () => 'Here is what the numbers say about your commute.',
  },
  {
    test: /\b(?:window|ventilat|air(?:ing)? out|fresh air|open)/i,
    pick: (p) => p.items.filter((i) => i.kind === 'ventilate' || i.kind === 'protect'),
    intro: (p) =>
      p.lid.stagnantHours > 0
        ? `A smog lid covers ${p.lid.stagnantHours} of the next 24 hours, so timing matters.`
        : 'Dispersion is reasonable today.',
  },
  {
    test: /\b(?:purifier|filter|indoor|home|room|coil|incense|cook|kitchen|smok|heater)/i,
    pick: (p) => p.items.filter((i) => i.kind === 'home' || i.kind === 'upgrade'),
    intro: () => 'Indoor air is where your family spends most hours, so these matter most.',
  },
  {
    test: /\b(?:masks?|k?n95)\b/i,
    pick: (p) => p.items.filter((i) => i.title.includes('N95') || i.kind === 'commute'),
    intro: () =>
      'A well-fitted N95 or FFP2 removes most fine particles; cloth and surgical masks do little against PM2.5. Fit matters more than brand: no gaps at the nose or cheeks.',
  },
];

/**
 * An offline answer to a chat question, built only from the plan. Picks the routine items that
 * match the question's topic (or the free actions when nothing matches). `aiConfigured` changes
 * the footnote: AI busy right now versus no AI key on the server.
 */
export function fallbackAnswer(question: string, plan: PlanResult, aiConfigured = false): string {
  const intent = INTENTS.find((i) => i.test.test(question));
  const items = intent
    ? intent.pick(plan).slice(0, 4)
    : plan.items.filter((i) => i.freeAction).slice(0, 4);
  const intro = intent ? intent.intro(plan) : plan.headline;
  const body = items.length
    ? items.map(bullet).join('\n')
    : '- Nothing specific to change for this today.';
  const note = aiConfigured
    ? "_Gemini is busy right now, so Exhale's offline engine answered from your live plan. Ask again in a minute for a conversational answer._"
    : "_Answered by Exhale's offline engine. Add a Gemini API key on the server for full conversational answers._";
  return `${intro}\n\n${body}\n\n${note}`;
}
