/**
 * The AI wording for one plan: a cached answer when the same prompt was answered recently, then
 * Gemini (every key and model), then Claude Haiku. Null means no provider answered in time and
 * the caller uses the engine's own words.
 */
import type { PlanResult } from '../src/lib/planner/engine.js';
import type { Household } from '../src/lib/profile/schema.js';
import { claudeJson } from './claude.js';
import type { Deadline } from './deadline.js';
import { generateJson, type JsonResult } from './gemini.js';
import { createPlanCache } from './planCache.js';
import { PLAN_SYSTEM, buildPlanPrompt } from './prompts.js';
import { AI_PLAN_JSON_SCHEMA, aiPlanSchema, type AiPlan } from './schemas.js';

const cache = createPlanCache<JsonResult<AiPlan>>();

/** Empties the plan cache (test hook). */
export function clearPlanCache(): void {
  cache.clear();
}

/**
 * The validated AI plan for this engine plan and household, with the model that wrote it.
 * Only a validated provider answer is cached: a failure or a rules-only fallback is never stored,
 * so the next request tries the providers again.
 */
export async function explainPlan(
  plan: PlanResult,
  household: Household,
  deadline: Deadline,
): Promise<JsonResult<AiPlan> | null> {
  const prompt = buildPlanPrompt(plan, household);
  const cached = cache.get(prompt);
  if (cached) return cached;
  const request = {
    system: PLAN_SYSTEM,
    prompt,
    jsonSchema: AI_PLAN_JSON_SCHEMA,
    validate: aiPlanSchema,
    deadline,
  };
  const ai = (await generateJson(request)) ?? (await claudeJson(request));
  if (ai) cache.set(prompt, ai);
  return ai;
}
