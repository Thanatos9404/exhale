import { getAir } from '../server/airCache.js';
import { CLAUDE_MODEL, claudeJson } from '../server/claude.js';
import { generateJson } from '../server/gemini.js';
import { HttpError, clientKey, errorResponse, json, readJson } from '../server/http.js';
import { PLAN_SYSTEM, buildPlanPrompt } from '../server/prompts.js';
import { createRateLimiter } from '../server/rateLimit.js';
import {
  AI_PLAN_JSON_SCHEMA,
  aiPlanSchema,
  planRequestSchema,
  type AiPlan,
} from '../server/schemas.js';
import { buildPlan, type PlanResult } from '../src/lib/planner/engine.js';
import type { PlanResponse } from '../src/lib/apiTypes.js';
import { parseHousehold } from '../src/lib/profile/schema.js';

/** 12 plans per 5 minutes per client: each plan can fan out to several AI calls. */
const limiter = createRateLimiter({ limit: 12, windowMs: 5 * 60_000 });

/** A place plus a household profile fits well inside this. */
const MAX_BODY_BYTES = 24_000;

/** Keeps only explanations for items the engine produced, in engine order. */
function mergeAi(plan: PlanResult, ai: AiPlan): AiPlan {
  const ids = new Set(plan.items.map((i) => i.id));
  return { ...ai, items: ai.items.filter((i) => ids.has(i.id)) };
}

/**
 * POST /api/plan
 * Body: { place: { lat, lon, label }, household }
 * Fetches live air data server-side, runs the deterministic planner, then asks Gemini to explain
 * the plan and add tailored indoor hacks and sustainable swaps. Without a key (or on failure)
 * it returns the engine's plan alone so the app keeps working.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const rl = limiter.check(clientKey(request));
    if (!rl.ok)
      throw new HttpError(429, 'Too many plans requested. Try again shortly.', {
        'retry-after': String(rl.retryAfterSec),
      });

    const body = planRequestSchema.safeParse(await readJson(request, MAX_BODY_BYTES));
    if (!body.success) throw new HttpError(400, 'Invalid plan request');
    const household = parseHousehold(body.data.household);
    if (!household) throw new HttpError(400, 'Invalid household profile');

    const air = await getAir(body.data.place).catch(() => {
      throw new HttpError(502, 'Air data provider is unavailable');
    });
    const plan = buildPlan(household, air);

    const aiRequest = {
      system: PLAN_SYSTEM,
      prompt: buildPlanPrompt(plan, household),
      jsonSchema: AI_PLAN_JSON_SCHEMA,
      validate: aiPlanSchema,
    };
    // Gemini first (every key and model), then Claude Haiku, then the engine's own words.
    const ai = (await generateJson(aiRequest)) ?? (await claudeJson(aiRequest));

    const response: PlanResponse = {
      plan,
      ai: ai ? mergeAi(plan, ai.data) : null,
      source: !ai ? 'rules' : ai.model === CLAUDE_MODEL ? 'claude' : 'gemini',
      model: ai?.model ?? null,
    };
    return json(response, 200, { 'x-ratelimit-remaining': String(rl.remaining) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET is not supported; answers 405 with an Allow header. */
export function GET(): Response {
  return json({ error: 'Use POST' }, 405, { allow: 'POST' });
}
